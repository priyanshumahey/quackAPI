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
) -> Result<(), String> {
    let conn_id = payload.connection_id.clone();

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
            },
        );
    }

    let connections = state.connections.clone();

    tokio::spawn(async move {
        let ws_result = tokio_tungstenite::connect_async(request).await;

        let (ws_stream, response) = match ws_result {
            Ok((stream, resp)) => (stream, resp),
            Err(e) => {
                let _ = app.emit(
                    "ws-event",
                    WsEvent {
                        connection_id: conn_id.clone(),
                        kind: WsEventKind::Error {
                            message: format!("Connection failed: {e}"),
                        },
                    },
                );
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

        loop {
            tokio::select! {
                msg = read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            let size = text.len() as u64;
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Message {
                                    data: text.to_string(),
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
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Disconnected { code, reason },
                            });
                            break;
                        }
                        Some(Err(e)) => {
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Error {
                                    message: format!("WebSocket error: {e}"),
                                },
                            });
                            break;
                        }
                        None => {
                            // Stream ended
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Disconnected {
                                    code: None,
                                    reason: "Connection closed".to_string(),
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
                                let _ = app.emit("ws-event", WsEvent {
                                    connection_id: conn_id.clone(),
                                    kind: WsEventKind::Error {
                                        message: format!("Failed to send: {e}"),
                                    },
                                });
                                break;
                            }
                        }
                        Some(WsCommand::SendBinary(bin)) => {
                            if let Err(e) = write.send(Message::Binary(bin.into())).await {
                                let _ = app.emit("ws-event", WsEvent {
                                    connection_id: conn_id.clone(),
                                    kind: WsEventKind::Error {
                                        message: format!("Failed to send: {e}"),
                                    },
                                });
                                break;
                            }
                        }
                        Some(WsCommand::Disconnect) | None => {
                            let _ = write.send(Message::Close(None)).await;
                            let _ = app.emit("ws-event", WsEvent {
                                connection_id: conn_id.clone(),
                                kind: WsEventKind::Disconnected {
                                    code: Some(1000),
                                    reason: "Client disconnected".to_string(),
                                },
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Cleanup
        let mut conns = connections.lock().await;
        conns.remove(&conn_id);
    });

    Ok(())
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

    let cmd = match payload.message_type.as_str() {
        "binary" => {
            use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
            let bytes = BASE64
                .decode(&payload.message)
                .map_err(|e| format!("Invalid base64: {e}"))?;
            WsCommand::SendBinary(bytes)
        }
        _ => WsCommand::SendText(payload.message),
    };

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
