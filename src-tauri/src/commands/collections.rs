use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct CollectionFile {
    id: String,
    name: String,
    #[serde(default)]
    requests: Vec<CollectionFileRequest>,
}

#[derive(Debug, Deserialize)]
struct CollectionFileRequest {
    id: String,
    name: String,
    method: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum CollectionTreeItem {
    #[serde(rename = "folder")]
    Folder {
        id: String,
        name: String,
        children: Vec<CollectionTreeItem>,
    },
    #[serde(rename = "collection")]
    Collection {
        id: String,
        name: String,
        file_name: String,
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
                .into_iter()
                .map(|r| CollectionRequestSummary {
                    id: r.id,
                    name: r.name,
                    method: r.method.to_uppercase(),
                    collection_file: rel_file.clone(),
                })
                .collect();

            collections.push(CollectionTreeItem::Collection {
                id: col.id,
                name: col.name,
                file_name,
                requests,
            });
        }
    }

    // Sort alphabetically: folders first, then collections
    folders.sort_by(|a, b| {
        let name_a = match a {
            CollectionTreeItem::Folder { name, .. } => name,
            CollectionTreeItem::Collection { name, .. } => name,
        };
        let name_b = match b {
            CollectionTreeItem::Folder { name, .. } => name,
            CollectionTreeItem::Collection { name, .. } => name,
        };
        name_a.to_lowercase().cmp(&name_b.to_lowercase())
    });
    collections.sort_by(|a, b| {
        let name_a = match a {
            CollectionTreeItem::Folder { name, .. } => name,
            CollectionTreeItem::Collection { name, .. } => name,
        };
        let name_b = match b {
            CollectionTreeItem::Folder { name, .. } => name,
            CollectionTreeItem::Collection { name, .. } => name,
        };
        name_a.to_lowercase().cmp(&name_b.to_lowercase())
    });

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
