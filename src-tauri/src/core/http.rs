use std::collections::HashMap;
use std::time::Instant;

use serde::Serialize;

use super::collections::RequestDetails;
use super::collections::MultipartField;
use super::environments::substitute_env_vars;

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
        return "TLS error (record overflow). Try http:// instead of https://.".to_string();
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

/// Builds a `multipart/form-data` form from request fields, substituting env
/// vars in keys, text values, filenames and file paths. File parts are read
/// from disk relative to the current working directory.
///
/// # Errors
/// Returns an error if a referenced file cannot be read or a content type is
/// invalid.
async fn build_multipart_form(
    fields: &[MultipartField],
    sub: &impl Fn(&str) -> String,
) -> Result<reqwest::multipart::Form, String> {
    let mut form = reqwest::multipart::Form::new();

    for field in fields {
        let key = sub(&field.key);
        if key.is_empty() {
            continue;
        }

        if field.field_type == "file" {
            let path = sub(&field.value);
            let data = tokio::fs::read(&path)
                .await
                .map_err(|e| format!("multipart: failed to read file '{path}': {e}"))?;

            let filename = field
                .filename
                .as_ref()
                .map(|f| sub(f))
                .filter(|f| !f.is_empty())
                .unwrap_or_else(|| {
                    std::path::Path::new(&path)
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| "file".to_string())
                });

            let mut part = reqwest::multipart::Part::bytes(data).file_name(filename);
            if let Some(ct) = &field.content_type {
                let ct = sub(ct);
                if !ct.is_empty() {
                    part = part
                        .mime_str(&ct)
                        .map_err(|e| format!("multipart: invalid content type '{ct}': {e}"))?;
                }
            }
            form = form.part(key, part);
        } else {
            let mut part = reqwest::multipart::Part::text(sub(&field.value));
            if let Some(ct) = &field.content_type {
                let ct = sub(ct);
                if !ct.is_empty() {
                    part = part
                        .mime_str(&ct)
                        .map_err(|e| format!("multipart: invalid content type '{ct}': {e}"))?;
                }
            }
            form = form.part(key, part);
        }
    }

    Ok(form)
}

pub async fn execute_request(
    details: &RequestDetails,
    env_vars: &HashMap<String, String>,
) -> Result<HttpResponse, String> {
    let builder = build_request(details, env_vars).await?;
    let start = Instant::now();

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

    let bytes = response.bytes().await.map_err(|e| format!("Failed to read body: {e}"))?;
    let size_bytes = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
    let time_ms = u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX);
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(HttpResponse {
        status,
        status_text,
        headers: response_headers,
        body,
        time_ms,
        size_bytes,
    })
}

/// Sends a request and streams the response body, invoking `on_chunk` for each
/// chunk of bytes as it arrives. Useful for SSE / `text/event-stream` responses
/// where incremental output is wanted. The full body is still assembled and
/// returned (e.g. so it can be recorded in history).
///
/// # Errors
/// Returns an error if the request cannot be built, the connection fails, or a
/// chunk cannot be read from the response stream.
pub async fn execute_request_streaming(
    details: &RequestDetails,
    env_vars: &HashMap<String, String>,
    mut on_chunk: impl FnMut(&[u8]),
) -> Result<HttpResponse, String> {
    let builder = build_request(details, env_vars).await?;
    let start = Instant::now();

    let mut response = builder.send().await.map_err(|e| friendly_reqwest_error(&e))?;

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

    let mut all_bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Failed to read response stream: {e}"))?
    {
        on_chunk(&chunk);
        all_bytes.extend_from_slice(&chunk);
    }

    let elapsed = start.elapsed();
    let size_bytes = u64::try_from(all_bytes.len()).unwrap_or(u64::MAX);
    let time_ms = u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX);
    let body = String::from_utf8_lossy(&all_bytes).into_owned();

    Ok(HttpResponse {
        status,
        status_text,
        headers: response_headers,
        body,
        time_ms,
        size_bytes,
    })
}

/// Builds the `reqwest` request (client, method, URL, query, headers, body)
/// with env-var substitution applied, ready to be sent.
///
/// # Errors
/// Returns an error for an unsupported method, a client build failure, or a
/// multipart body whose file cannot be read.
async fn build_request(
    details: &RequestDetails,
    env_vars: &HashMap<String, String>,
) -> Result<reqwest::RequestBuilder, String> {
    let sub = |text: &str| substitute_env_vars(text, env_vars);

    let url = ensure_scheme(&sub(&details.url));
    let method: reqwest::Method = details
        .method
        .to_uppercase()
        .parse()
        .map_err(|_| format!("Unsupported HTTP method: {}", details.method))?;

    let client = reqwest::Client::builder()
        .http1_only()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .cookie_store(true)
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut builder = client.request(method, &url);

    // Query params
    let enabled_params: Vec<(String, String)> = details
        .params
        .iter()
        .filter(|p| p.enabled && !p.key.is_empty())
        .map(|p| (sub(&p.key), sub(&p.value)))
        .collect();
    if !enabled_params.is_empty() {
        builder = builder.query(&enabled_params);
    }

    // Headers
    for h in &details.headers {
        if h.enabled && !h.key.is_empty() {
            builder = builder.header(&sub(&h.key), &sub(&h.value));
        }
    }

    // Body
    match details.body.body_type.as_str() {
        "json" if !details.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "application/json")
                .body(sub(&details.body.content));
        }
        "text" if !details.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "text/plain")
                .body(sub(&details.body.content));
        }
        "x-www-form-urlencoded" if !details.body.content.is_empty() => {
            builder = builder
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(sub(&details.body.content));
        }
        "multipart" | "form-data" if !details.body.fields.is_empty() => {
            let form = build_multipart_form(&details.body.fields, &sub).await?;
            builder = builder.multipart(form);
        }
        _ => {}
    }

    Ok(builder)
}
