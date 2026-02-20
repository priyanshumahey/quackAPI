use serde::Serialize;
use std::fs;
use std::path::Path;

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
