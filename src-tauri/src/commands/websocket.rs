use std::collections::HashMap;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

struct WsConnection {
    cmd_tx: mpsc::UnboundedSender<WsCommand>,
    history: Option<(crate::core::history::HistoryStore, crate::core::history::EntryId)>,
}

enum WsCommand {
    SendText(String),
    SendBinary(Vec<u8>),
    Disconnect,
}

pub struct WebSocketState {
    connections: Arc<Mutex<HashMap<String, WsConnection>>>,
}

impl WebSocketState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Default for WebSocketState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsConnectPayload {
    pub connection_id: String,
    pub url: String,
    pub headers: Vec<WsHeaderParam>,
    pub protocols: Vec<String>,
    #[serde(default)]
    pub history: Option<WsHistoryMeta>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WsHistoryMeta {
    pub workspace_path: String,
    #[serde(default)]
    pub collection_request_id: Option<String>,
    #[serde(default)]
    pub request_name: Option<String>,
    #[serde(default)]
    pub collection_path: Option<String>,
    #[serde(default)]
    pub env_active: Option<String>,
    #[serde(default)]
    pub env_snapshot: Vec<WsKvSnapshot>,
    #[serde(default)]
    pub skip: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WsKvSnapshot {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct WsHeaderParam {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSendPayload {
    pub connection_id: String,
    pub message: String,
    pub message_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsEvent {
    connection_id: String,
    #[serde(flatten)]
    kind: WsEventKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum WsEventKind {
    #[serde(rename_all = "camelCase")]
    Connected {
        protocol: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Message {
        data: String,
        is_binary: bool,
        size_bytes: u64,
        timestamp_ms: u64,
    },
    #[serde(rename_all = "camelCase")]
    Disconnected {
        code: Option<u16>,
        reason: String,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        message: String,
    },
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}


#[tauri::command]
pub async fn ws_connect(
    app: AppHandle,
    payload: WsConnectPayload,
    state: State<'_, WebSocketState>,
    history: State<'_, crate::commands::HistoryState>,
) -> Result<(), String> {
    let conn_id = payload.connection_id.clone();

    let history_entry = open_ws_history_entry(&history, &payload);

    let mut request = payload
        .url
        .into_client_request()
        .map_err(|e| format!("Invalid WebSocket URL: {e}"))?;

    for h in &payload.headers {
        if h.enabled && !h.key.is_empty() {
            if let Ok(val) = HeaderValue::from_str(&h.value) {
                request.headers_mut().insert(
                    h.key.parse::<tokio_tungstenite::tungstenite::http::HeaderName>()
                        .map_err(|e| format!("Invalid header name '{}': {e}", h.key))?,
                    val,
                );
            }
        }
    }

    if !payload.protocols.is_empty() {
        let protocols_str = payload.protocols.join(", ");
        if let Ok(val) = HeaderValue::from_str(&protocols_str) {
            request.headers_mut().insert("Sec-WebSocket-Protocol", val);
        }
    }

    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<WsCommand>();

    {
        let mut conns = state.connections.lock().await;
        conns.insert(
            conn_id.clone(),
            WsConnection {
                cmd_tx: cmd_tx.clone(),
                history: history_entry.clone(),
            },
        );
    }

    let connections = state.connections.clone();
    let history_for_task = history_entry.clone();

    tokio::spawn(async move {
        let ws_result = tokio_tungstenite::connect_async(request).await;

        let (ws_stream, response) = match ws_result {
            Ok((stream, resp)) => (stream, resp),
            Err(e) => {
                let err_msg = format!("Connection failed: {e}");
                let _ = app.emit(
                    "ws-event",
                    WsEvent {
                        connection_id: conn_id.clone(),
                        kind: WsEventKind::Error {
                            message: err_msg.clone(),
                        },
                    },
                );
                if let Some((store, id)) = &history_for_task {
                    let _ = store.finalize_ws(
                        id,
                        &crate::core::history::WsClose {
                            code: None,
                            reason: String::new(),
                            error: Some(err_msg),
                        },
                    );
                }
                let mut conns = connections.lock().await;
                conns.remove(&conn_id);
                return;
            }
        };

        let protocol = response
            .headers()
            .get("Sec-WebSocket-Protocol")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        let _ = app.emit(
            "ws-event",
            WsEvent {
                connection_id: conn_id.clone(),
                kind: WsEventKind::Connected { protocol },
            },
        );

        let (mut write, mut read) = ws_stream.split();

        let mut close_code: Option<u16> = None;
        let mut close_reason: String = String::new();
        let mut close_err: Option<String> = None;

        loop {
            tokio::select! {
                msg = read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            let size = text.len() as u64;
                            let body = text.to_string();
                            if let Some((store, id)) = &history_for_task {
                                let _ = store.record_ws_message(id, "received", body.as_bytes(), false);
                            }
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Message {
                                    data: body,
                                    is_binary: false,
                                    size_bytes: size,
                                    timestamp_ms: epoch_ms(),
                                },
                            });
                        }
                        Some(Ok(Message::Binary(bin))) => {
                            use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
                            let size = bin.len() as u64;
                            let encoded = BASE64.encode(&bin);
                            if let Some((store, id)) = &history_for_task {
                                let _ = store.record_ws_message(id, "received", &bin, true);
                            }
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Message {
                                    data: encoded,
                                    is_binary: true,
                                    size_bytes: size,
                                    timestamp_ms: epoch_ms(),
                                },
                            });
                        }
                        Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {
                            // Tungstenite handles pong replies automatically
                        }
                        Some(Ok(Message::Close(frame))) => {
                            let (code, reason) = frame
                                .map(|f| (Some(f.code.into()), f.reason.to_string()))
                                .unwrap_or((None, String::new()));
                            close_code = code;
                            close_reason = reason.clone();
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Disconnected { code, reason },
                            });
                            break;
                        }
                        Some(Err(e)) => {
                            let msg = format!("WebSocket error: {e}");
                            close_err = Some(msg.clone());
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Error {
                                    message: msg,
                                },
                            });
                            break;
                        }
                        None => {
                            close_reason = "Connection closed".to_string();
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Disconnected {
                                    code: None,
                                    reason: close_reason.clone(),
                                },
                            });
                            break;
                        }
                        _ => {}
                    }
                }
                // Commands from the frontend
                cmd = cmd_rx.recv() => {
                    match cmd {
                        Some(WsCommand::SendText(text)) => {
                            if let Err(e) = write.send(Message::Text(text.into())).await {
                                let msg = format!("Failed to send: {e}");
                                close_err = Some(msg.clone());
                                let _ = app.emit("ws-event", WsEvent {
                                    connection_id: conn_id.clone(),
                                    kind: WsEventKind::Error {
                                        message: msg,
                                    },
                                });
                                break;
                            }
                        }
                        Some(WsCommand::SendBinary(bin)) => {
                            if let Err(e) = write.send(Message::Binary(bin.into())).await {
                                let msg = format!("Failed to send: {e}");
                                close_err = Some(msg.clone());
                                let _ = app.emit("ws-event", WsEvent {
                                    connection_id: conn_id.clone(),
                                    kind: WsEventKind::Error {
                                        message: msg,
                                    },
                                });
                                break;
                            }
                        }
                        Some(WsCommand::Disconnect) | None => {
                            let _ = write.send(Message::Close(None)).await;
                            close_code = Some(1000);
                            close_reason = "Client disconnected".to_string();
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Disconnected {
                                    code: close_code,
                                    reason: close_reason.clone(),
                                },
                            });
                            break;
                        }
                    }
                }
            }
        }

        if let Some((store, id)) = &history_for_task {
            let _ = store.finalize_ws(
                id,
                &crate::core::history::WsClose {
                    code: close_code,
                    reason: close_reason,
                    error: close_err,
                },
            );
        }

        let mut conns = connections.lock().await;
        conns.remove(&conn_id);
    });

    Ok(())
}

fn open_ws_history_entry(
    state: &tauri::State<'_, crate::commands::HistoryState>,
    payload: &WsConnectPayload,
) -> Option<(crate::core::history::HistoryStore, crate::core::history::EntryId)> {
    let meta = payload.history.as_ref()?;
    if meta.skip {
        return None;
    }
    let store = match state.store_for(&meta.workspace_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("history: ws store open failed: {e}");
            return None;
        }
    };
    let attempt = crate::core::history::WsAttempt {
        request_id: meta.collection_request_id.clone(),
        request_name: meta.request_name.clone(),
        collection_path: meta.collection_path.clone(),
        url: payload.url.clone(),
        headers: payload
            .headers
            .iter()
            .filter(|h| h.enabled)
            .map(|h| (h.key.clone(), h.value.clone()))
            .collect(),
        env_active: meta.env_active.clone(),
        env_snapshot: meta
            .env_snapshot
            .iter()
            .map(|kv| (kv.key.clone(), kv.value.clone()))
            .collect(),
    };
    match store.begin_ws(&attempt) {
        Ok(id) => Some((store, id)),
        Err(e) => {
            eprintln!("history: begin_ws failed: {e}");
            None
        }
    }
}

#[tauri::command]
pub async fn ws_send_message(
    payload: WsSendPayload,
    state: State<'_, WebSocketState>,
) -> Result<(), String> {
    let conns = state.connections.lock().await;
    let conn = conns
        .get(&payload.connection_id)
        .ok_or_else(|| "No active WebSocket connection with this ID".to_string())?;

    let (cmd, recorded_bytes, is_binary) = match payload.message_type.as_str() {
        "binary" => {
            use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
            let bytes = BASE64
                .decode(&payload.message)
                .map_err(|e| format!("Invalid base64: {e}"))?;
            (WsCommand::SendBinary(bytes.clone()), bytes, true)
        }
        _ => {
            let bytes = payload.message.as_bytes().to_vec();
            (WsCommand::SendText(payload.message), bytes, false)
        }
    };

    if let Some((store, id)) = &conn.history {
        let _ = store.record_ws_message(id, "sent", &recorded_bytes, is_binary);
    }

    conn.cmd_tx
        .send(cmd)
        .map_err(|_| "Connection is closed".to_string())
}

#[tauri::command]
pub async fn ws_disconnect(
    connection_id: String,
    state: State<'_, WebSocketState>,
) -> Result<(), String> {
    let conns = state.connections.lock().await;
    if let Some(conn) = conns.get(&connection_id) {
        let _ = conn.cmd_tx.send(WsCommand::Disconnect);
    }
    Ok(())
}
