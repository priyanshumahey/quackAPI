use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVariable {
    pub index: usize,
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvFileInfo {
    pub name: String,
    pub file_name: String,
    pub variables: Vec<EnvVariable>,
    pub is_enabled: bool,
}

/// Persisted in `.quack/environments/.state.json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EnvState {
    #[serde(default)]
    enabled_files: Vec<String>,
    #[serde(default)]
    disabled_var_indexes: HashMap<String, Vec<usize>>,
}

fn env_dir(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path)
        .join(".quack")
        .join("environments")
}

fn state_path(workspace_path: &str) -> std::path::PathBuf {
    env_dir(workspace_path).join(".state.json")
}

fn read_state(workspace_path: &str) -> EnvState {
    let path = state_path(workspace_path);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        EnvState::default()
    }
}

fn write_state(workspace_path: &str, state: &EnvState) -> Result<(), String> {
    let path = state_path(workspace_path);
    let content = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize state: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Failed to write state: {e}"))
}

fn parse_env_content(content: &str, disabled_indexes: &[usize]) -> Vec<EnvVariable> {
    let mut out = vec![];

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        let index = out.len();
        let key = key.trim().to_string();
        let value = value.trim().to_string();
        let enabled = !disabled_indexes.contains(&index);

        out.push(EnvVariable {
            index,
            key,
            value,
            enabled,
        });
    }

    out
}

fn all_env_names(workspace_path: &str) -> Vec<String> {
    let dir = env_dir(workspace_path);
    let mut names = vec![];
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "env") {
                if let Some(stem) = path.file_stem() {
                    names.push(stem.to_string_lossy().to_string());
                }
            }
        }
    }
    names
}

#[tauri::command]
pub fn list_environments(workspace_path: &str) -> Result<Vec<EnvFileInfo>, String> {
    let dir = env_dir(workspace_path);
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let state = read_state(workspace_path);
    let mut out = vec![];

    let entries =
        fs::read_dir(&dir).map_err(|e| format!("Failed to read environments dir: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "env") {
            let file_name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let name = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {path:?}: {e}"))?;

            let disabled_indexes = state
                .disabled_var_indexes
                .get(&name)
                .cloned()
                .unwrap_or_default();
            let variables = parse_env_content(&content, &disabled_indexes);

            // When state has never been written, treat every file as enabled.
            let is_enabled = if state.enabled_files.is_empty() {
                true
            } else {
                state.enabled_files.contains(&name)
            };

            out.push(EnvFileInfo {
                name,
                file_name,
                variables,
                is_enabled,
            });
        }
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn toggle_env_file(
    workspace_path: &str,
    env_name: &str,
    enabled: bool,
) -> Result<(), String> {
    let mut state = read_state(workspace_path);
    if state.enabled_files.is_empty() {
        state.enabled_files = all_env_names(workspace_path);
    }

    if enabled {
        if !state.enabled_files.contains(&env_name.to_string()) {
            state.enabled_files.push(env_name.to_string());
        }
    } else {
        state.enabled_files.retain(|f| f != env_name);
    }

    write_state(workspace_path, &state)
}

#[tauri::command]
pub fn toggle_env_variable(
    workspace_path: &str,
    env_name: &str,
    index: usize,
    enabled: bool,
) -> Result<(), String> {
    let mut state = read_state(workspace_path);

    let disabled = state
        .disabled_var_indexes
        .entry(env_name.to_string())
        .or_default();

    if enabled {
        disabled.retain(|i| *i != index);
    } else if !disabled.contains(&index) {
        disabled.push(index);
        disabled.sort_unstable();
    }

    if disabled.is_empty() {
        state.disabled_var_indexes.remove(env_name);
    }

    write_state(workspace_path, &state)
}

#[tauri::command]
pub fn add_env_variable(
    workspace_path: &str,
    env_name: &str,
    key: &str,
    value: &str,
) -> Result<Vec<EnvVariable>, String> {
    let env_path = env_dir(workspace_path).join(format!("{env_name}.env"));

    if !env_path.exists() {
        return Err(format!("Environment file not found: {env_name}.env"));
    }

    let mut content =
        fs::read_to_string(&env_path).map_err(|e| format!("Failed to read env file: {e}"))?;

    if !content.ends_with('\n') && !content.is_empty() {
        content.push('\n');
    }
    content.push_str(&format!("{key}={value}\n"));

    fs::write(&env_path, &content).map_err(|e| format!("Failed to write env file: {e}"))?;

    let state = read_state(workspace_path);
    let disabled_indexes = state
        .disabled_var_indexes
        .get(env_name)
        .cloned()
        .unwrap_or_default();
    Ok(parse_env_content(&content, &disabled_indexes))
}

#[tauri::command]
pub fn update_env_variable(
    workspace_path: &str,
    env_name: &str,
    index: usize,
    new_key: &str,
    new_value: &str,
) -> Result<Vec<EnvVariable>, String> {
    let env_path = env_dir(workspace_path).join(format!("{env_name}.env"));

    if !env_path.exists() {
        return Err(format!("Environment file not found: {env_name}.env"));
    }

    let content =
        fs::read_to_string(&env_path).map_err(|e| format!("Failed to read env file: {e}"))?;

    let mut variable_index = 0usize;
    let mut replaced = false;
    let new_content: String = content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return line.to_string();
            }

            if line.split_once('=').is_some() {
                let current = variable_index;
                variable_index += 1;
                if current == index {
                    replaced = true;
                    return format!("{new_key}={new_value}");
                }
            }

            line.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";

    if !replaced {
        return Err(format!("Variable index out of bounds: {index}"));
    }

    fs::write(&env_path, &new_content).map_err(|e| format!("Failed to write env file: {e}"))?;

    let state = read_state(workspace_path);
    let disabled_indexes = state
        .disabled_var_indexes
        .get(env_name)
        .cloned()
        .unwrap_or_default();
    Ok(parse_env_content(&new_content, &disabled_indexes))
}

#[tauri::command]
pub fn delete_env_variable(
    workspace_path: &str,
    env_name: &str,
    index: usize,
) -> Result<Vec<EnvVariable>, String> {
    let env_path = env_dir(workspace_path).join(format!("{env_name}.env"));

    if !env_path.exists() {
        return Err(format!("Environment file not found: {env_name}.env"));
    }

    let content =
        fs::read_to_string(&env_path).map_err(|e| format!("Failed to read env file: {e}"))?;

    let mut variable_index = 0usize;
    let mut removed = false;
    let new_content: String = content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return Some(line.to_string());
            }

            if line.split_once('=').is_some() {
                let current = variable_index;
                variable_index += 1;
                if current == index {
                    removed = true;
                    return None;
                }
            }

            Some(line.to_string())
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";

    if !removed {
        return Err(format!("Variable index out of bounds: {index}"));
    }

    fs::write(&env_path, &new_content).map_err(|e| format!("Failed to write env file: {e}"))?;

    let mut state = read_state(workspace_path);

    if let Some(disabled_indexes) = state.disabled_var_indexes.get_mut(env_name) {
        disabled_indexes.retain(|i| *i != index);
        for i in disabled_indexes.iter_mut() {
            if *i > index {
                *i -= 1;
            }
        }
        if disabled_indexes.is_empty() {
            state.disabled_var_indexes.remove(env_name);
        }
    }
    write_state(workspace_path, &state)?;

    let disabled_indexes = state
        .disabled_var_indexes
        .get(env_name)
        .cloned()
        .unwrap_or_default();
    Ok(parse_env_content(&new_content, &disabled_indexes))
}

#[tauri::command]
pub fn create_env_file(
    workspace_path: &str,
    env_name: &str,
) -> Result<(), String> {
    let dir = env_dir(workspace_path);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create environments dir: {e}"))?;

    let env_path = dir.join(format!("{env_name}.env"));
    if env_path.exists() {
        return Err(format!("Environment already exists: {env_name}"));
    }

    fs::write(&env_path, "").map_err(|e| format!("Failed to create env file: {e}"))?;

    let mut state = read_state(workspace_path);
    if state.enabled_files.is_empty() {
        state.enabled_files = all_env_names(workspace_path);
    } else if !state.enabled_files.contains(&env_name.to_string()) {
        state.enabled_files.push(env_name.to_string());
    }
    write_state(workspace_path, &state)
}

#[tauri::command]
pub fn rename_env_file(
    workspace_path: &str,
    old_name: &str,
    new_name: &str,
) -> Result<(), String> {
    let dir = env_dir(workspace_path);
    let old_path = dir.join(format!("{old_name}.env"));
    let new_path = dir.join(format!("{new_name}.env"));

    if !old_path.exists() {
        return Err(format!("Environment not found: {old_name}"));
    }
    if new_path.exists() {
        return Err(format!("Environment already exists: {new_name}"));
    }

    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename env file: {e}"))?;

    let mut state = read_state(workspace_path);
    if let Some(pos) = state.enabled_files.iter().position(|f| f == old_name) {
        state.enabled_files[pos] = new_name.to_string();
    }
    if let Some(indexes) = state.disabled_var_indexes.remove(old_name) {
        state.disabled_var_indexes.insert(new_name.to_string(), indexes);
    }
    write_state(workspace_path, &state)
}

#[tauri::command]
pub fn delete_env_file(
    workspace_path: &str,
    env_name: &str,
) -> Result<(), String> {
    let env_path = env_dir(workspace_path).join(format!("{env_name}.env"));
    if !env_path.exists() {
        return Err(format!("Environment not found: {env_name}"));
    }

    fs::remove_file(&env_path).map_err(|e| format!("Failed to delete env file: {e}"))?;

    let mut state = read_state(workspace_path);
    state.enabled_files.retain(|f| f != env_name);
    state.disabled_var_indexes.remove(env_name);
    write_state(workspace_path, &state)
}
