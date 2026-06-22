use serde::{Deserialize, Serialize};
use std::time::Instant;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

pub struct HttpClientState {
    pub client: reqwest::Client,
    pub active_requests: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl HttpClientState {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .http1_only()
            .danger_accept_invalid_certs(true)
            .redirect(reqwest::redirect::Policy::limited(10))
            .cookie_store(true)
            .no_proxy()
            .connect_timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build reqwest client");

        Self {
            client,
            active_requests: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for HttpClientState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestPayload {
    pub request_id: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<KvParam>,
    pub params: Vec<KvParam>,
    pub body: BodyPayload,
    #[serde(default)]
    pub history: Option<HistoryMeta>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMeta {
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
    pub env_snapshot: Vec<KvSnapshot>,
    #[serde(default)]
    pub replay_of_id: Option<String>,
    #[serde(default)]
    pub tags: Option<String>,
    /// When true the request is executed but no history row is inserted.
    #[serde(default)]
    pub skip: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct KvSnapshot {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct KvParam {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct BodyPayload {
    #[serde(rename = "type")]
    pub body_type: String,
    pub content: String,
    #[serde(default)]
    pub fields: Vec<MultipartFieldPayload>,
}

#[derive(Debug, Deserialize)]
pub struct MultipartFieldPayload {
    pub key: String,
    #[serde(rename = "type", default = "default_field_type")]
    pub field_type: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default, rename = "contentType")]
    pub content_type: Option<String>,
}

fn default_field_type() -> String {
    "text".to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<ResponseHeader>,
    pub body: String,
    pub body_base64: String,
    pub is_binary: bool,
    pub time_ms: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct ResponseHeader {
    pub key: String,
    pub value: String,
}

fn ensure_scheme(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    }
}

fn friendly_reqwest_error(e: &reqwest::Error) -> String {
    let root = {
        let mut cause: &dyn std::error::Error = e;
        while let Some(src) = cause.source() {
            cause = src;
        }
        cause.to_string()
    };

    if root.contains("record overflow") {
        return "TLS error (record overflow). You are trying to connect via HTTPS, but the server is likely running on plain HTTP. Try changing the URL to http:// instead of https://.".to_string();
    }

    if e.is_connect() {
        if let Some(url) = e.url() {
            return format!("Could not connect to {url}: {root}");
        }
        return format!("Could not connect: {root}");
    }
    if e.is_timeout() {
        return "Request timed out.".to_string();
    }
    if e.is_request() {
        return format!("Invalid request: {root}");
    }
    if e.is_redirect() {
        return "Too many redirects.".to_string();
    }
    format!("Request failed: {root}")
}

#[tauri::command]
pub async fn cancel_http_request(
    request_id: String,
    state: State<'_, HttpClientState>,
) -> Result<(), String> {
    let mut requests = state.active_requests.lock().map_err(|_| "Mutex poisoned")?;
    if let Some(sender) = requests.remove(&request_id) {
        let _ = sender.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn send_http_request(
    app: AppHandle,
    payload: SendRequestPayload,
    state: State<'_, HttpClientState>,
    history: State<'_, crate::commands::HistoryState>,
) -> Result<HttpResponse, String> {
    let entry = open_history_entry(&history, &payload);

    let outcome = execute_http_inner(&app, &payload, &state).await;

    match (&entry, &outcome) {
        (Some((store, id)), Ok((resp, bytes))) => {
            let result = crate::core::history::HttpResult {
                status: resp.status,
                status_text: resp.status_text.clone(),
                headers: resp
                    .headers
                    .iter()
                    .map(|h| (h.key.clone(), h.value.clone()))
                    .collect(),
                body: bytes.clone(),
                is_binary: resp.is_binary,
                time_ms: resp.time_ms,
            };
            let _ = store.finalize_http_ok(id, &result);
        }
        (Some((store, id)), Err(err_msg)) => {
            let _ = store.finalize_http_err(id, err_msg);
        }
        _ => {}
    }

    outcome.map(|(resp, _)| resp)
}

fn open_history_entry(
    state: &tauri::State<'_, crate::commands::HistoryState>,
    payload: &SendRequestPayload,
) -> Option<(crate::core::history::HistoryStore, crate::core::history::EntryId)> {
    let meta = payload.history.as_ref()?;
    if meta.skip {
        return None;
    }
    let store = match state.store_for(&meta.workspace_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("history: failed to open store: {e}");
            return None;
        }
    };

    let attempt = crate::core::history::HttpAttempt {
        request_id: meta.collection_request_id.clone(),
        request_name: meta.request_name.clone(),
        collection_path: meta.collection_path.clone(),
        method: payload.method.clone(),
        url: payload.url.clone(),
        headers: payload
            .headers
            .iter()
            .filter(|h| h.enabled)
            .map(|h| (h.key.clone(), h.value.clone()))
            .collect(),
        params: payload
            .params
            .iter()
            .filter(|p| p.enabled)
            .map(|p| (p.key.clone(), p.value.clone()))
            .collect(),
        body_type: payload.body.body_type.clone(),
        body_content: payload.body.content.clone(),
        env_active: meta.env_active.clone(),
        env_snapshot: meta
            .env_snapshot
            .iter()
            .map(|kv| (kv.key.clone(), kv.value.clone()))
            .collect(),
        replay_of_id: meta
            .replay_of_id
            .as_ref()
            .map(|s| crate::core::history::EntryId(s.clone())),
        tags: meta.tags.clone(),
    };

    match store.begin_http(&attempt) {
        Ok(id) => Some((store, id)),
        Err(e) => {
            eprintln!("history: begin_http failed: {e}");
            None
        }
    }
}

/// Builds a `multipart/form-data` form from request fields. File parts are read
/// from disk relative to the current working directory.
async fn build_multipart_form(
    fields: &[MultipartFieldPayload],
) -> Result<reqwest::multipart::Form, String> {
    let mut form = reqwest::multipart::Form::new();

    for field in fields {
        if field.key.is_empty() {
            continue;
        }

        if field.field_type == "file" {
            let path = field.value.clone();
            let data = tokio::fs::read(&path)
                .await
                .map_err(|e| format!("multipart: failed to read file '{path}': {e}"))?;

            let filename = field
                .filename
                .clone()
                .filter(|f| !f.is_empty())
                .unwrap_or_else(|| {
                    std::path::Path::new(&path)
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| "file".to_string())
                });

            let mut part = reqwest::multipart::Part::bytes(data).file_name(filename);
            if let Some(ct) = &field.content_type {
                if !ct.is_empty() {
                    part = part
                        .mime_str(ct)
                        .map_err(|e| format!("multipart: invalid content type '{ct}': {e}"))?;
                }
            }
            form = form.part(field.key.clone(), part);
        } else {
            let mut part = reqwest::multipart::Part::text(field.value.clone());
            if let Some(ct) = &field.content_type {
                if !ct.is_empty() {
                    part = part
                        .mime_str(ct)
                        .map_err(|e| format!("multipart: invalid content type '{ct}': {e}"))?;
                }
            }
            form = form.part(field.key.clone(), part);
        }
    }

    Ok(form)
}

async fn execute_http_inner(
    app: &AppHandle,
    payload: &SendRequestPayload,
    state: &State<'_, HttpClientState>,
) -> Result<(HttpResponse, Vec<u8>), String> {
    let start = Instant::now();
    let url = ensure_scheme(&payload.url);

    let method: reqwest::Method = payload
        .method
        .to_uppercase()
        .parse()
        .map_err(|_| format!("Unsupported HTTP method: {}", payload.method))?;

    let mut builder = state.client.request(method, &url);

    let enabled_params: Vec<(&str, &str)> = payload
        .params
        .iter()
        .filter(|p| p.enabled && !p.key.is_empty())
        .map(|p| (p.key.as_str(), p.value.as_str()))
        .collect();

    if !enabled_params.is_empty() {
        builder = builder.query(&enabled_params);
    }

    for h in &payload.headers {
        if h.enabled && !h.key.is_empty() {
            builder = builder.header(&h.key, &h.value);
        }
    }

    match payload.body.body_type.as_str() {
        "json" if !payload.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "application/json")
                .body(payload.body.content.clone());
        }
        "text" if !payload.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "text/plain")
                .body(payload.body.content.clone());
        }
        "x-www-form-urlencoded" if !payload.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(payload.body.content.clone());
        }
        "multipart" | "form-data" if !payload.body.fields.is_empty() => {
            let form = build_multipart_form(&payload.body.fields).await?;
            builder = builder.multipart(form);
        }
        _ => {}
    }

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    {
        let mut requests = state.active_requests.lock().map_err(|_| "Mutex poisoned")?;
        requests.insert(payload.request_id.clone(), cancel_tx);
    }

    let request_future = builder.send();

    let response_result = tokio::select! {
        res = request_future => res,
        _ = &mut cancel_rx => {
            let mut requests = state.active_requests.lock().unwrap();
            requests.remove(&payload.request_id);
            return Err("Request cancelled by user".to_string());
        }
    };

    let response = match response_result {
        Ok(res) => res,
        Err(e) => {
            let mut requests = state.active_requests.lock().unwrap();
            requests.remove(&payload.request_id);
            return Err(friendly_reqwest_error(&e));
        }
    };
    let elapsed = start.elapsed();

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("Unknown")
        .to_string();

    let response_headers: Vec<ResponseHeader> = response
        .headers()
        .iter()
        .map(|(k, v)| ResponseHeader {
            key: k.to_string(),
            value: v.to_str().unwrap_or("<binary>").to_string(),
        })
        .collect();

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let is_binary = !content_type.starts_with("text/")
        && !content_type.contains("json")
        && !content_type.contains("xml")
        && !content_type.contains("javascript")
        && !content_type.is_empty();

    let total_bytes = response.content_length();

    let mut all_bytes: Vec<u8> = Vec::new();
    let mut response = response;
    loop {
        let chunk_result = tokio::select! {
            res = response.chunk() => res,
            _ = &mut cancel_rx => {
                let mut requests = state.active_requests.lock().unwrap();
                requests.remove(&payload.request_id);
                return Err("Request cancelled by user".to_string());
            }
        };

        match chunk_result {
            Ok(Some(chunk)) => {
                all_bytes.extend_from_slice(&chunk);
                let _ = app.emit("http-progress", serde_json::json!({
                    "requestId": payload.request_id,
                    "bytesRead": all_bytes.len() as u64,
                    "totalBytes": total_bytes,
                }));
                if !is_binary {
                    let chunk_text = String::from_utf8_lossy(&chunk).into_owned();
                    let _ = app.emit("http-chunk", serde_json::json!({
                        "requestId": payload.request_id,
                        "chunk": chunk_text,
                    }));
                }
            }
            Ok(None) => break,
            Err(e) => {
                let mut requests = state.active_requests.lock().unwrap();
                requests.remove(&payload.request_id);
                return Err(format!("Failed to read response body: {e}"));
            }
        }
    }

    let size_bytes = u64::try_from(all_bytes.len()).unwrap_or(u64::MAX);
    let time_ms = u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX);

    let (body, body_base64) = if is_binary {
        (String::new(), BASE64.encode(&all_bytes))
    } else {
        (String::from_utf8_lossy(&all_bytes).into_owned(), String::new())
    };

    {
        let mut requests = state.active_requests.lock().unwrap();
        requests.remove(&payload.request_id);
    }

    let resp = HttpResponse {
        status,
        status_text,
        headers: response_headers,
        body,
        body_base64,
        is_binary,
        time_ms,
        size_bytes,
    };
    Ok((resp, all_bytes))
}
