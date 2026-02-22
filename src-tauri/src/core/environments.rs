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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EnvState {
    #[serde(default)]
    pub enabled_files: Vec<String>,
    #[serde(default)]
    pub disabled_var_indexes: HashMap<String, Vec<usize>>,
}

pub fn env_dir(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path)
        .join(".quack")
        .join("environments")
}

pub fn state_path(workspace_path: &str) -> std::path::PathBuf {
    env_dir(workspace_path).join(".state.json")
}

pub fn read_state(workspace_path: &str) -> EnvState {
    let path = state_path(workspace_path);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        EnvState::default()
    }
}

pub fn parse_env_content(content: &str, disabled_indexes: &[usize]) -> Vec<EnvVariable> {
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

pub fn load_environments(workspace_path: &str) -> Result<Vec<EnvFileInfo>, String> {
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

pub fn resolve_env_vars(workspace_path: &str) -> Result<HashMap<String, String>, String> {
    let envs = load_environments(workspace_path)?;
    let mut map = HashMap::new();
    for env in &envs {
        if !env.is_enabled {
            continue;
        }
        for v in &env.variables {
            if v.enabled {
                map.insert(v.key.clone(), v.value.clone());
            }
        }
    }
    Ok(map)
}

pub fn substitute_env_vars(text: &str, vars: &HashMap<String, String>) -> String {
    let re = regex::Regex::new(r"\{\{([^}]+)\}\}").expect("invalid regex");
    re.replace_all(text, |caps: &regex::Captures| {
        let var_name = &caps[1];
        vars.get(var_name)
            .cloned()
            .unwrap_or_else(|| caps[0].to_string())
    })
    .into_owned()
}
