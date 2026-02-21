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
) -> Result<HttpResponse, String> {
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
                .body(payload.body.content);
        }
        "text" if !payload.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "text/plain")
                .body(payload.body.content);
        }
        "x-www-form-urlencoded" if !payload.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(payload.body.content);
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
            // Remove from active requests on cancel
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

    Ok(HttpResponse {
        status,
        status_text,
        headers: response_headers,
        body,
        body_base64,
        is_binary,
        time_ms,
        size_bytes,
    })
}
