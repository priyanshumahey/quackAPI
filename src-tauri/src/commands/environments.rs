use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVariable {
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
    disabled_vars: HashMap<String, Vec<String>>,
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

fn parse_env_content(content: &str, disabled_keys: &[String]) -> Vec<EnvVariable> {
    content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with('#')
        })
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            let enabled = !disabled_keys.contains(&key);
            Some(EnvVariable { key, value, enabled })
        })
        .collect()
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

            let disabled_keys = state
                .disabled_vars
                .get(&name)
                .cloned()
                .unwrap_or_default();
            let variables = parse_env_content(&content, &disabled_keys);

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
    key: &str,
    enabled: bool,
) -> Result<(), String> {
    let mut state = read_state(workspace_path);
    let disabled = state
        .disabled_vars
        .entry(env_name.to_string())
        .or_default();

    if enabled {
        disabled.retain(|k| k != key);
    } else if !disabled.contains(&key.to_string()) {
        disabled.push(key.to_string());
    }

    if disabled.is_empty() {
        state.disabled_vars.remove(env_name);
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
    let disabled_keys = state
        .disabled_vars
        .get(env_name)
        .cloned()
        .unwrap_or_default();
    Ok(parse_env_content(&content, &disabled_keys))
}

#[tauri::command]
pub fn update_env_variable(
    workspace_path: &str,
    env_name: &str,
    old_key: &str,
    new_key: &str,
    new_value: &str,
) -> Result<Vec<EnvVariable>, String> {
    let env_path = env_dir(workspace_path).join(format!("{env_name}.env"));

    if !env_path.exists() {
        return Err(format!("Environment file not found: {env_name}.env"));
    }

    let content =
        fs::read_to_string(&env_path).map_err(|e| format!("Failed to read env file: {e}"))?;

    let new_content: String = content
        .lines()
        .map(|line| {
            if let Some((key, _)) = line.split_once('=') {
                if key.trim() == old_key {
                    return format!("{new_key}={new_value}");
                }
            }
            line.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";

    fs::write(&env_path, &new_content).map_err(|e| format!("Failed to write env file: {e}"))?;

    if old_key != new_key {
        let mut state = read_state(workspace_path);
        if let Some(disabled) = state.disabled_vars.get_mut(env_name) {
            if let Some(pos) = disabled.iter().position(|k| k == old_key) {
                disabled[pos] = new_key.to_string();
            }
        }
        write_state(workspace_path, &state)?;
    }

    let state = read_state(workspace_path);
    let disabled_keys = state
        .disabled_vars
        .get(env_name)
        .cloned()
        .unwrap_or_default();
    Ok(parse_env_content(&new_content, &disabled_keys))
}

#[tauri::command]
pub fn delete_env_variable(
    workspace_path: &str,
    env_name: &str,
    key: &str,
) -> Result<Vec<EnvVariable>, String> {
    let env_path = env_dir(workspace_path).join(format!("{env_name}.env"));

    if !env_path.exists() {
        return Err(format!("Environment file not found: {env_name}.env"));
    }

    let content =
        fs::read_to_string(&env_path).map_err(|e| format!("Failed to read env file: {e}"))?;

    let new_content: String = content
        .lines()
        .filter(|line| {
            if let Some((k, _)) = line.split_once('=') {
                k.trim() != key
            } else {
                true
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";

    fs::write(&env_path, &new_content).map_err(|e| format!("Failed to write env file: {e}"))?;

    let mut state = read_state(workspace_path);
    if let Some(disabled) = state.disabled_vars.get_mut(env_name) {
        disabled.retain(|k| k != key);
        if disabled.is_empty() {
            state.disabled_vars.remove(env_name);
        }
    }
    write_state(workspace_path, &state)?;

    let disabled_keys = state
        .disabled_vars
        .get(env_name)
        .cloned()
        .unwrap_or_default();
    Ok(parse_env_content(&new_content, &disabled_keys))
}
