use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub children: Option<Vec<FileEntry>>,
    pub is_loaded: bool,
}

#[tauri::command]
pub fn read_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {e}"))?;

    let mut items: Vec<FileEntry> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let full_path = entry.path().to_string_lossy().to_string();

            let entry_type = if metadata.is_dir() {
                "folder"
            } else {
                "file"
            };

            Some(FileEntry {
                name,
                path: full_path,
                entry_type: entry_type.to_string(),
                children: if metadata.is_dir() { None } else { None },
                is_loaded: false,
            })
        })
        .collect();

    items.sort_by(|a, b| {
        let type_order = |t: &str| -> u8 {
            if t == "folder" {
                0
            } else {
                1
            }
        };
        type_order(&a.entry_type)
            .cmp(&type_order(&b.entry_type))
            .then_with(|| {
                a.name
                    .to_lowercase()
                    .cmp(&b.name.to_lowercase())
            })
    });

    Ok(items)
}

#[tauri::command]
pub fn expand_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    read_directory(path)
}

#[tauri::command]
pub fn check_folder_exists(path: &str) -> bool {
    Path::new(path).is_dir()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub exists: bool,
    #[serde(rename = "type")]
    pub path_type: String,
    pub name: String,
}

#[tauri::command]
pub fn get_path_info(path: &str) -> PathInfo {
    let p = Path::new(path);
    if !p.exists() {
        return PathInfo {
            exists: false,
            path_type: "none".to_string(),
            name: p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
        };
    }

    let path_type = if p.is_dir() {
        "folder"
    } else {
        "file"
    };

    PathInfo {
        exists: true,
        path_type: path_type.to_string(),
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
    }
}

#[tauri::command]
pub fn check_quack_initialized(workspace_path: &str) -> bool {
    Path::new(workspace_path).join(".quack").is_dir()
}

#[tauri::command]
pub fn init_quack_workspace(workspace_path: &str) -> Result<(), String> {
    let root = Path::new(workspace_path).join(".quack");
    let collections = root.join("collections");
    let environments = root.join("environments");

    fs::create_dir_all(&collections)
        .map_err(|e| format!("Failed to create collections dir: {e}"))?;
    fs::create_dir_all(&environments)
        .map_err(|e| format!("Failed to create environments dir: {e}"))?;

    let hello = serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "name": "Hello World",
        "requests": [
            {
                "id": Uuid::new_v4().to_string(),
                "name": "Hello GET",
                "method": "GET",
                "url": "{{baseUrl}}/hello",
                "headers": [],
                "params": [],
                "body": { "type": "none", "content": "" }
            }
        ]
    });

    fs::write(
        collections.join("hello-world.json"),
        serde_json::to_string_pretty(&hello)
            .map_err(|e| format!("Failed to serialize collection: {e}"))?,
    )
    .map_err(|e| format!("Failed to write collection: {e}"))?;

    fs::write(environments.join("local.env"), "BASE_URL=http://localhost:3000\n")
        .map_err(|e| format!("Failed to write env: {e}"))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionFile {
    pub id: String,
    pub name: String,
    pub requests: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVariable {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvFile {
    pub name: String,
    pub variables: Vec<EnvVariable>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuackWorkspaceData {
    pub collections: Vec<CollectionFile>,
    pub environments: Vec<EnvFile>,
}

#[tauri::command]
pub fn load_quack_workspace(workspace_path: &str) -> Result<QuackWorkspaceData, String> {
    let root = Path::new(workspace_path).join(".quack");
    if !root.is_dir() {
        return Err("Workspace not initialized".to_string());
    }

    let collections = read_collections(&root.join("collections"))?;
    let environments = read_environments(&root.join("environments"))?;

    Ok(QuackWorkspaceData {
        collections,
        environments,
    })
}

fn read_collections(dir: &Path) -> Result<Vec<CollectionFile>, String> {
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let mut out = vec![];
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read collections: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            let content =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read {path:?}: {e}"))?;
            let collection: CollectionFile = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse {path:?}: {e}"))?;
            out.push(collection);
        }
    }

    Ok(out)
}

fn read_environments(dir: &Path) -> Result<Vec<EnvFile>, String> {
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let mut out = vec![];
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read environments: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "env") {
            let name = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let content =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read {path:?}: {e}"))?;

            let variables = content
                .lines()
                .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
                .filter_map(|line| {
                    let (key, value) = line.split_once('=')?;
                    Some(EnvVariable {
                        key: key.trim().to_string(),
                        value: value.trim().to_string(),
                    })
                })
                .collect();

            out.push(EnvFile { name, variables });
        }
    }

    Ok(out)
}
