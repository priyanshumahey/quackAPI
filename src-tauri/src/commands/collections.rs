use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
struct CollectionFile {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    requests: Vec<CollectionFileRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CollectionFileRequest {
    id: String,
    name: String,
    method: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    headers: Vec<serde_json::Value>,
    #[serde(default)]
    params: Vec<serde_json::Value>,
    #[serde(default)]
    body: Option<serde_json::Value>,
    #[serde(default)]
    settings: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum CollectionTreeItem {
    #[serde(rename = "folder", rename_all = "camelCase")]
    Folder {
        id: String,
        name: String,
        rel_path: String,
        children: Vec<CollectionTreeItem>,
    },
    #[serde(rename = "collection", rename_all = "camelCase")]
    Collection {
        id: String,
        name: String,
        file_name: String,
        rel_path: String,
        description: Option<String>,
        requests: Vec<CollectionRequestSummary>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRequestSummary {
    pub id: String,
    pub name: String,
    pub method: String,
    pub collection_file: String,
}

fn collections_dir(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path)
        .join(".quack")
        .join("collections")
}

fn build_tree(dir: &Path, rel_prefix: &str) -> Vec<CollectionTreeItem> {
    let Ok(entries) = fs::read_dir(dir) else {
        return vec![];
    };

    let mut folders: Vec<CollectionTreeItem> = vec![];
    let mut collections: Vec<CollectionTreeItem> = vec![];

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if file_name.starts_with('.') {
                continue;
            }
            let child_prefix = if rel_prefix.is_empty() {
                file_name.clone()
            } else {
                format!("{rel_prefix}/{file_name}")
            };
            let children = build_tree(&path, &child_prefix);
            folders.push(CollectionTreeItem::Folder {
                id: format!("folder-{child_prefix}"),
                name: file_name,
                rel_path: child_prefix,
                children,
            });
        } else if path.extension().is_some_and(|ext| ext == "json") {
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let Ok(col) = serde_json::from_str::<CollectionFile>(&content) else {
                continue;
            };

            let rel_file = if rel_prefix.is_empty() {
                file_name.clone()
            } else {
                format!("{rel_prefix}/{file_name}")
            };

            let requests = col
                .requests
                .iter()
                .map(|r| CollectionRequestSummary {
                    id: r.id.clone(),
                    name: r.name.clone(),
                    method: r.method.to_uppercase(),
                    collection_file: rel_file.clone(),
                })
                .collect();

            collections.push(CollectionTreeItem::Collection {
                id: col.id,
                name: col.name,
                file_name: file_name.clone(),
                rel_path: rel_file,
                description: col.description,
                requests,
            });
        }
    }

    let sort_name = |item: &CollectionTreeItem| -> String {
        match item {
            CollectionTreeItem::Folder { name, .. } => name.to_lowercase(),
            CollectionTreeItem::Collection { name, .. } => name.to_lowercase(),
        }
    };
    folders.sort_by(|a, b| sort_name(a).cmp(&sort_name(b)));
    collections.sort_by(|a, b| sort_name(a).cmp(&sort_name(b)));

    folders.extend(collections);
    folders
}

#[tauri::command]
pub fn list_collections(workspace_path: &str) -> Result<Vec<CollectionTreeItem>, String> {
    let dir = collections_dir(workspace_path);
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    Ok(build_tree(&dir, ""))
}

#[tauri::command]
pub fn create_collection_folder(
    workspace_path: &str,
    parent_rel_path: &str,
    name: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let parent = if parent_rel_path.is_empty() {
        base
    } else {
        base.join(parent_rel_path)
    };
    let folder = parent.join(name);
    if folder.exists() {
        return Err(format!("Folder already exists: {name}"));
    }
    fs::create_dir_all(&folder).map_err(|e| format!("Failed to create folder: {e}"))
}

#[tauri::command]
pub fn create_collection(
    workspace_path: &str,
    parent_rel_path: &str,
    name: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let parent = if parent_rel_path.is_empty() {
        base
    } else {
        base.join(parent_rel_path)
    };
    fs::create_dir_all(&parent).map_err(|e| format!("Failed to ensure parent dir: {e}"))?;

    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let file_name = if slug.is_empty() {
        format!("{}.json", Uuid::new_v4())
    } else {
        format!("{slug}.json")
    };

    let file_path = parent.join(&file_name);
    if file_path.exists() {
        return Err(format!("Collection file already exists: {file_name}"));
    }

    let col = CollectionFile {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        description: None,
        requests: vec![CollectionFileRequest {
            id: Uuid::new_v4().to_string(),
            name: "New Request".to_string(),
            method: "GET".to_string(),
            url: String::new(),
            headers: vec![],
            params: vec![],
            body: Some(serde_json::json!({"type": "none", "content": ""})),
            settings: None,
        }],
    };

    let content = serde_json::to_string_pretty(&col)
        .map_err(|e| format!("Failed to serialize collection: {e}"))?;
    fs::write(&file_path, content).map_err(|e| format!("Failed to write collection: {e}"))
}

#[tauri::command]
pub fn rename_collection_folder(
    workspace_path: &str,
    rel_path: &str,
    new_name: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let old = base.join(rel_path);
    if !old.is_dir() {
        return Err(format!("Folder not found: {rel_path}"));
    }
    let new_path = old
        .parent()
        .ok_or("Cannot determine parent")?
        .join(new_name);
    if new_path.exists() {
        return Err(format!("Already exists: {new_name}"));
    }
    fs::rename(&old, &new_path).map_err(|e| format!("Failed to rename folder: {e}"))
}

#[tauri::command]
pub fn rename_collection(
    workspace_path: &str,
    rel_path: &str,
    new_name: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let file = base.join(rel_path);
    if !file.is_file() {
        return Err(format!("Collection not found: {rel_path}"));
    }

    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read: {e}"))?;
    let mut col: CollectionFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
    col.name = new_name.to_string();

    let new_content = serde_json::to_string_pretty(&col)
        .map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&file, new_content).map_err(|e| format!("Failed to write: {e}"))
}

#[tauri::command]
pub fn delete_collection_item(
    workspace_path: &str,
    rel_path: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let target = base.join(rel_path);
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| format!("Failed to delete folder: {e}"))
    } else if target.is_file() {
        fs::remove_file(&target).map_err(|e| format!("Failed to delete file: {e}"))
    } else {
        Err(format!("Not found: {rel_path}"))
    }
}

#[tauri::command]
pub fn add_request_to_collection(
    workspace_path: &str,
    collection_rel_path: &str,
    name: &str,
    method: &str,
) -> Result<String, String> {
    let base = collections_dir(workspace_path);
    let file = base.join(collection_rel_path);
    if !file.is_file() {
        return Err(format!("Collection not found: {collection_rel_path}"));
    }

    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read: {e}"))?;
    let mut col: CollectionFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let new_id = Uuid::new_v4().to_string();
    col.requests.push(CollectionFileRequest {
        id: new_id.clone(),
        name: name.to_string(),
        method: method.to_uppercase(),
        url: String::new(),
        headers: vec![],
        params: vec![],
        body: Some(serde_json::json!({"type": "none", "content": ""})),
        settings: None,
    });

    let new_content = serde_json::to_string_pretty(&col)
        .map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&file, new_content).map_err(|e| format!("Failed to write: {e}"))?;
    Ok(new_id)
}

#[tauri::command]
pub fn move_collection_item(
    workspace_path: &str,
    item_rel_path: &str,
    dest_parent_rel_path: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let source = base.join(item_rel_path);
    if !source.exists() {
        return Err(format!("Source not found: {item_rel_path}"));
    }

    let dest_dir = if dest_parent_rel_path.is_empty() {
        base.clone()
    } else {
        base.join(dest_parent_rel_path)
    };
    if !dest_dir.is_dir() {
        return Err(format!("Destination folder not found: {dest_parent_rel_path}"));
    }

    let item_name = source
        .file_name()
        .ok_or("Cannot get file name")?
        .to_string_lossy()
        .to_string();
    let dest = dest_dir.join(&item_name);

    if dest.exists() {
        return Err(format!("Item already exists at destination: {item_name}"));
    }

    if source.is_dir() {
        let dest_canonical = dest_dir
            .canonicalize()
            .map_err(|e| format!("Canon error: {e}"))?;
        let src_canonical = source
            .canonicalize()
            .map_err(|e| format!("Canon error: {e}"))?;
        if dest_canonical.starts_with(&src_canonical) {
            return Err("Cannot move a folder into itself".to_string());
        }
    }

    fs::rename(&source, &dest).map_err(|e| format!("Failed to move item: {e}"))
}

#[tauri::command]
pub fn move_request_to_collection(
    workspace_path: &str,
    request_id: &str,
    source_collection_rel_path: &str,
    dest_collection_rel_path: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);

    // Validate both files exist BEFORE modifying anything (prevent data loss)
    let src_file = base.join(source_collection_rel_path);
    if !src_file.is_file() {
        return Err(format!(
            "Source collection not found: {source_collection_rel_path}"
        ));
    }
    let dest_file = base.join(dest_collection_rel_path);
    if !dest_file.is_file() {
        return Err(format!(
            "Destination collection not found: {dest_collection_rel_path}"
        ));
    }

    let src_content =
        fs::read_to_string(&src_file).map_err(|e| format!("Failed to read source: {e}"))?;
    let mut src_col: CollectionFile =
        serde_json::from_str(&src_content).map_err(|e| format!("Invalid source JSON: {e}"))?;

    let pos = src_col
        .requests
        .iter()
        .position(|r| r.id == request_id)
        .ok_or_else(|| format!("Request {request_id} not found in source collection"))?;
    let request = src_col.requests.remove(pos);

    let dest_content =
        fs::read_to_string(&dest_file).map_err(|e| format!("Failed to read destination: {e}"))?;
    let mut dest_col: CollectionFile =
        serde_json::from_str(&dest_content).map_err(|e| format!("Invalid dest JSON: {e}"))?;
    dest_col.requests.push(request);

    // Write both files only after all validation and manipulation succeeded
    let src_out = serde_json::to_string_pretty(&src_col)
        .map_err(|e| format!("Failed to serialize source: {e}"))?;
    let dest_out = serde_json::to_string_pretty(&dest_col)
        .map_err(|e| format!("Failed to serialize dest: {e}"))?;
    fs::write(&src_file, src_out).map_err(|e| format!("Failed to write source: {e}"))?;
    fs::write(&dest_file, dest_out).map_err(|e| format!("Failed to write dest: {e}"))
}

#[tauri::command]
pub fn rename_request(
    workspace_path: &str,
    collection_rel_path: &str,
    request_id: &str,
    new_name: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let file = base.join(collection_rel_path);
    if !file.is_file() {
        return Err(format!("Collection not found: {collection_rel_path}"));
    }

    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read: {e}"))?;
    let mut col: CollectionFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let req = col
        .requests
        .iter_mut()
        .find(|r| r.id == request_id)
        .ok_or_else(|| format!("Request {request_id} not found"))?;
    req.name = new_name.to_string();

    let new_content = serde_json::to_string_pretty(&col)
        .map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&file, new_content).map_err(|e| format!("Failed to write: {e}"))
}

#[tauri::command]
pub fn delete_request(
    workspace_path: &str,
    collection_rel_path: &str,
    request_id: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let file = base.join(collection_rel_path);
    if !file.is_file() {
        return Err(format!("Collection not found: {collection_rel_path}"));
    }

    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read: {e}"))?;
    let mut col: CollectionFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let pos = col
        .requests
        .iter()
        .position(|r| r.id == request_id)
        .ok_or_else(|| format!("Request {request_id} not found"))?;
    col.requests.remove(pos);

    let new_content = serde_json::to_string_pretty(&col)
        .map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&file, new_content).map_err(|e| format!("Failed to write: {e}"))
}

#[tauri::command]
pub fn update_collection_description(
    workspace_path: &str,
    collection_rel_path: &str,
    description: Option<String>,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let file = base.join(collection_rel_path);
    if !file.is_file() {
        return Err(format!("Collection not found: {collection_rel_path}"));
    }
    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read: {e}"))?;
    let mut col: CollectionFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
    col.description = description;
    let new_content = serde_json::to_string_pretty(&col)
        .map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&file, new_content).map_err(|e| format!("Failed to write: {e}"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestDetails {
    pub id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<RequestHeaderDetail>,
    pub params: Vec<RequestParamDetail>,
    pub body: RequestBodyDetail,
    pub settings: RequestSettingsDetail,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSettingsDetail {
    pub verify_ssl: bool,
    pub proxy_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestHeaderDetail {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestParamDetail {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBodyDetail {
    #[serde(rename = "type")]
    pub body_type: String,
    pub content: String,
}

fn parse_request_details(req: &CollectionFileRequest) -> RequestDetails {
    let headers = req
        .headers
        .iter()
        .filter_map(|h| {
            let obj = h.as_object()?;
            Some(RequestHeaderDetail {
                key: obj.get("key")?.as_str().unwrap_or("").to_string(),
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
            Some(RequestParamDetail {
                key: obj.get("key")?.as_str().unwrap_or("").to_string(),
                value: obj.get("value")?.as_str().unwrap_or("").to_string(),
                enabled: obj.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
            })
        })
        .collect();

    let body = match &req.body {
        Some(b) => {
            let obj = b.as_object();
            RequestBodyDetail {
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
            }
        }
        None => RequestBodyDetail {
            body_type: "none".to_string(),
            content: String::new(),
        },
    };

    let settings = match &req.settings {
        Some(s) => {
            let obj = s.as_object();
            RequestSettingsDetail {
                verify_ssl: obj
                    .and_then(|o| o.get("verifySsl"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                proxy_url: obj
                    .and_then(|o| o.get("proxyUrl"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            }
        }
        None => RequestSettingsDetail {
            verify_ssl: false,
            proxy_url: None,
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
        settings,
    }
}

#[tauri::command]
pub fn get_request_details(
    workspace_path: &str,
    collection_rel_path: &str,
    request_id: &str,
) -> Result<RequestDetails, String> {
    let base = collections_dir(workspace_path);
    let file = base.join(collection_rel_path);
    if !file.is_file() {
        return Err(format!("Collection not found: {collection_rel_path}"));
    }

    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read: {e}"))?;
    let col: CollectionFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let req = col
        .requests
        .iter()
        .find(|r| r.id == request_id)
        .ok_or_else(|| format!("Request {request_id} not found"))?;

    Ok(parse_request_details(req))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRequestPayload {
    pub method: Option<String>,
    pub url: Option<String>,
    pub headers: Option<Vec<serde_json::Value>>,
    pub params: Option<Vec<serde_json::Value>>,
    pub body: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
}

#[tauri::command]
pub fn update_request(
    workspace_path: &str,
    collection_rel_path: &str,
    request_id: &str,
    payload: UpdateRequestPayload,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let file = base.join(collection_rel_path);
    if !file.is_file() {
        return Err(format!("Collection not found: {collection_rel_path}"));
    }

    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read: {e}"))?;
    let mut col: CollectionFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let req = col
        .requests
        .iter_mut()
        .find(|r| r.id == request_id)
        .ok_or_else(|| format!("Request {request_id} not found"))?;

    if let Some(method) = payload.method {
        req.method = method;
    }
    if let Some(url) = payload.url {
        req.url = url;
    }
    if let Some(headers) = payload.headers {
        req.headers = headers;
    }
    if let Some(params) = payload.params {
        req.params = params;
    }
    if let Some(body) = payload.body {
        req.body = Some(body);
    }
    if let Some(settings) = payload.settings {
        req.settings = Some(settings);
    }

    let new_content = serde_json::to_string_pretty(&col)
        .map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&file, new_content).map_err(|e| format!("Failed to write: {e}"))
}

#[tauri::command]
pub fn read_folder_readme(
    workspace_path: &str,
    folder_rel_path: &str,
) -> Result<Option<String>, String> {
    let base = collections_dir(workspace_path);
    let dir = if folder_rel_path.is_empty() {
        base
    } else {
        base.join(folder_rel_path)
    };
    let readme = dir.join("README.md");
    if !readme.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&readme).map_err(|e| format!("Failed to read README: {e}"))?;
    Ok(Some(content))
}

#[tauri::command]
pub fn write_folder_readme(
    workspace_path: &str,
    folder_rel_path: &str,
    content: &str,
) -> Result<(), String> {
    let base = collections_dir(workspace_path);
    let dir = if folder_rel_path.is_empty() {
        base
    } else {
        base.join(folder_rel_path)
    };
    if !dir.is_dir() {
        return Err(format!("Folder not found: {folder_rel_path}"));
    }
    let readme = dir.join("README.md");
    fs::write(&readme, content).map_err(|e| format!("Failed to write README: {e}"))
}
