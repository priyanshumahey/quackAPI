//! Tauri command bindings + state for the history subsystem.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::history::{
    EntryId, HistoryEntry, HistoryError, HistoryFilter, HistoryStore, RedactionConfig,
};

pub struct HistoryState {
    inner: Mutex<HashMap<String, HistoryStore>>,
}

impl HistoryState {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Get (or lazily open) the store for `workspace_path`.
    ///
    /// # Errors
    /// Returns the underlying [`HistoryError`] if opening the DB or creating
    /// the on-disk directories fails.
    pub fn store_for(&self, workspace_path: &str) -> Result<HistoryStore, HistoryError> {
        let mut map = self
            .inner
            .lock()
            .map_err(|_| HistoryError::Db("history state mutex poisoned".into()))?;

        if let Some(s) = map.get(workspace_path) {
            return Ok(s.clone());
        }
        let store = HistoryStore::open(workspace_path, None)?;
        map.insert(workspace_path.to_string(), store.clone());
        Ok(store)
    }
}

impl Default for HistoryState {
    fn default() -> Self {
        Self::new()
    }
}


#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryListArgs {
    pub workspace_path: String,
    #[serde(default)]
    pub filter: HistoryFilter,
}

#[tauri::command]
pub fn history_list(
    args: HistoryListArgs,
    state: State<'_, HistoryState>,
) -> Result<Vec<HistoryEntry>, String> {
    let store = state.store_for(&args.workspace_path).map_err(|e| e.to_string())?;
    store.list(&args.filter).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryGetArgs {
    pub workspace_path: String,
    pub entry_id: String,
}

#[tauri::command]
pub fn history_get(
    args: HistoryGetArgs,
    state: State<'_, HistoryState>,
) -> Result<Option<HistoryEntry>, String> {
    let store = state.store_for(&args.workspace_path).map_err(|e| e.to_string())?;
    store.get(&EntryId(args.entry_id)).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryBlob {
    pub bytes_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryReadBlobArgs {
    pub workspace_path: String,
    pub sha: String,
}

#[tauri::command]
pub fn history_read_blob(
    args: HistoryReadBlobArgs,
    state: State<'_, HistoryState>,
) -> Result<HistoryBlob, String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    let store = state.store_for(&args.workspace_path).map_err(|e| e.to_string())?;
    let bytes = store.read_blob(&args.sha).map_err(|e| e.to_string())?;
    Ok(HistoryBlob {
        bytes_base64: B64.encode(&bytes),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryDeleteArgs {
    pub workspace_path: String,
    pub entry_id: String,
}

#[tauri::command]
pub fn history_delete(
    args: HistoryDeleteArgs,
    state: State<'_, HistoryState>,
) -> Result<(), String> {
    let store = state.store_for(&args.workspace_path).map_err(|e| e.to_string())?;
    store
        .delete(&EntryId(args.entry_id))
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryClearArgs {
    pub workspace_path: String,
}

#[tauri::command]
pub fn history_clear(
    args: HistoryClearArgs,
    state: State<'_, HistoryState>,
) -> Result<(), String> {
    let store = state.store_for(&args.workspace_path).map_err(|e| e.to_string())?;
    store.clear().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactionInfo {
    pub enabled: bool,
    pub header_names: Vec<String>,
    pub env_fragments: Vec<String>,
}

#[tauri::command]
pub fn history_redaction_defaults() -> RedactionInfo {
    let cfg = RedactionConfig::default();
    RedactionInfo {
        enabled: cfg.enabled,
        header_names: cfg.header_names,
        env_fragments: cfg.env_fragments,
    }
}
