use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestPayload {
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
pub async fn send_http_request(payload: SendRequestPayload) -> Result<HttpResponse, String> {
    let start = Instant::now();

    let url = ensure_scheme(&payload.url);

    let method: reqwest::Method = payload
        .method
        .to_uppercase()
        .parse()
        .map_err(|_| format!("Unsupported HTTP method: {}", payload.method))?;

    let client = reqwest::Client::builder()
        .http1_only()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let mut builder = client.request(method, &url);

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

    let response = builder.send().await.map_err(|e| friendly_reqwest_error(&e))?;
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

    let body_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    let size_bytes = u64::try_from(body_bytes.len()).unwrap_or(u64::MAX);
    let body = String::from_utf8_lossy(&body_bytes).into_owned();
    let time_ms = u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX);

    Ok(HttpResponse {
        status,
        status_text,
        headers: response_headers,
        body,
        time_ms,
        size_bytes,
    })
}
