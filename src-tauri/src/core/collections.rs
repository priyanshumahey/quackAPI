use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollectionFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub requests: Vec<CollectionFileRequest>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollectionFileRequest {
    pub id: String,
    pub name: String,
    pub method: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub headers: Vec<serde_json::Value>,
    #[serde(default)]
    pub params: Vec<serde_json::Value>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
    #[serde(default)]
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RequestDetails {
    pub id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<KvParam>,
    pub params: Vec<KvParam>,
    pub body: BodyPayload,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KvParam {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BodyPayload {
    #[serde(rename = "type")]
    pub body_type: String,
    pub content: String,
    #[serde(default)]
    pub fields: Vec<MultipartField>,
}

/// A single part of a `multipart/form-data` body.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MultipartField {
    pub key: String,
    /// `"text"` for a plain field, `"file"` for a file upload.
    #[serde(rename = "type", default = "default_field_type")]
    pub field_type: String,
    /// For a text field, the literal value. For a file field, the path to the file.
    #[serde(default)]
    pub value: String,
    /// Optional filename override for file fields (defaults to the file's name).
    #[serde(default)]
    pub filename: Option<String>,
    /// Optional explicit content-type for this part.
    #[serde(default, rename = "contentType")]
    pub content_type: Option<String>,
}

fn default_field_type() -> String {
    "text".to_string()
}

pub fn collections_dir(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path)
        .join(".quack")
        .join("collections")
}

pub fn load_collection(path: &Path) -> Result<CollectionFile, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

pub fn load_all_collections(workspace_path: &str) -> Result<Vec<(String, CollectionFile)>, String> {
    let dir = collections_dir(workspace_path);
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    collect_json_files(&dir, "")
}

fn collect_json_files(dir: &Path, rel_prefix: &str) -> Result<Vec<(String, CollectionFile)>, String> {
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {e}", dir.display()))?;

    let mut out = vec![];

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if file_name.starts_with('.') {
                continue;
            }
            let child_prefix = if rel_prefix.is_empty() {
                file_name
            } else {
                format!("{rel_prefix}/{file_name}")
            };
            out.extend(collect_json_files(&path, &child_prefix)?);
        } else if path.extension().is_some_and(|ext| ext == "json") {
            let rel_file = if rel_prefix.is_empty() {
                file_name
            } else {
                format!("{rel_prefix}/{file_name}")
            };
            let col = load_collection(&path)?;
            out.push((rel_file, col));
        }
    }
    Ok(out)
}

fn parse_multipart_field(value: &serde_json::Value) -> Option<MultipartField> {
    let obj = value.as_object()?;
    Some(MultipartField {
        key: obj.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        field_type: obj
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("text")
            .to_string(),
        value: obj.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        filename: obj
            .get("filename")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
        content_type: obj
            .get("contentType")
            .and_then(|v| v.as_str())
            .map(ToString::to_string),
    })
}

pub fn parse_request_details(req: &CollectionFileRequest) -> RequestDetails {
    let headers = req
        .headers
        .iter()
        .filter_map(|h| {
            let obj = h.as_object()?;
            Some(KvParam {
                key: obj
                    .get("key")
                    .or_else(|| obj.get("name"))
                    ?
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                value: obj.get("value")?.as_str().unwrap_or("").to_string(),
                enabled: obj.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
            })
        })
        .collect();

    let params = req
        .params
        .iter()
        .filter_map(|p| {
            let obj = p.as_object()?;
            Some(KvParam {
                key: obj
                    .get("key")
                    .or_else(|| obj.get("name"))
                    ?
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                value: obj.get("value")?.as_str().unwrap_or("").to_string(),
                enabled: obj.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
            })
        })
        .collect();

    let body = match &req.body {
        Some(b) => {
            let obj = b.as_object();
            BodyPayload {
                body_type: obj
                    .and_then(|o| o.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("none")
                    .to_string(),
                content: obj
                    .and_then(|o| o.get("content"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                fields: obj
                    .and_then(|o| o.get("fields"))
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(parse_multipart_field).collect())
                    .unwrap_or_default(),
            }
        }
        None => BodyPayload {
            body_type: "none".to_string(),
            content: String::new(),
            fields: Vec::new(),
        },
    };

    RequestDetails {
        id: req.id.clone(),
        name: req.name.clone(),
        method: req.method.to_uppercase(),
        url: req.url.clone(),
        headers,
        params,
        body,
    }
}

pub fn find_request(
    workspace_path: &str,
    query: &str,
) -> Result<(String, RequestDetails), String> {
    let all = load_all_collections(workspace_path)?;
    let query_lower = query.to_lowercase();

    for (rel_path, col) in &all {
        for req in &col.requests {
            if req.id == query {
                return Ok((rel_path.clone(), parse_request_details(req)));
            }
        }
    }
    for (rel_path, col) in &all {
        for req in &col.requests {
            if req.name.to_lowercase() == query_lower {
                return Ok((rel_path.clone(), parse_request_details(req)));
            }
        }
    }

    let mut matches: Vec<(String, RequestDetails)> = vec![];
    for (rel_path, col) in &all {
        for req in &col.requests {
            if req.name.to_lowercase().contains(&query_lower) {
                matches.push((rel_path.clone(), parse_request_details(req)));
            }
        }
    }

    match matches.len() {
        0 => Err(format!("No request found matching '{query}'")),
        1 => Ok(matches.remove(0)),
        n => {
            let names: Vec<String> = matches
                .iter()
                .map(|(path, r)| format!("  - {} ({} in {})", r.name, r.method, path))
                .collect();
            Err(format!(
                "Ambiguous: {n} requests match '{query}':\n{}",
                names.join("\n")
            ))
        }
    }
}

pub fn list_all_requests(
    workspace_path: &str,
) -> Result<Vec<(String, String, RequestDetails)>, String> {
    let all = load_all_collections(workspace_path)?;
    let mut out = vec![];
    for (rel_path, col) in &all {
        for req in &col.requests {
            out.push((col.name.clone(), rel_path.clone(), parse_request_details(req)));
        }
    }
    Ok(out)
}
