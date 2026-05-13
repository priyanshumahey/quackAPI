//! SQLite-backed history store.
//!
//! Layout: `<data_dir>/com.quack-api.app/history/workspaces/<hash>/history.db`
//! plus a sibling `blobs/<sha256>.bin` directory for large/binary payloads.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::redact::{redact_env, redact_headers, RedactionConfig};

const SCHEMA_VERSION: i32 = 1;
const BODY_INLINE_THRESHOLD: usize = 32 * 1024;
const BODY_MAX_BYTES: usize = 5 * 1024 * 1024;
const APP_DIR_NAME: &str = "com.quack-api.app";

const SCHEMA_SQL: &str = include_str!("schema.sql");

#[derive(Debug)]
pub enum HistoryError {
    Io(String),
    Db(String),
    Ser(String),
    Disabled,
}

impl std::fmt::Display for HistoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(s) => write!(f, "history I/O error: {s}"),
            Self::Db(s) => write!(f, "history DB error: {s}"),
            Self::Ser(s) => write!(f, "history serialization error: {s}"),
            Self::Disabled => write!(f, "history is disabled"),
        }
    }
}
impl std::error::Error for HistoryError {}

impl From<std::io::Error> for HistoryError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}
impl From<rusqlite::Error> for HistoryError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Db(e.to_string())
    }
}
impl From<serde_json::Error> for HistoryError {
    fn from(e: serde_json::Error) -> Self {
        Self::Ser(e.to_string())
    }
}

/// Time-sortable entry id: `<epoch_ms_hex>-<uuid>`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EntryId(pub String);

impl EntryId {
    fn new(epoch_ms: u64) -> Self {
        Self(format!("{epoch_ms:013x}-{}", Uuid::new_v4()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryProtocol {
    Http,
    Ws,
}

impl EntryProtocol {
    fn as_str(self) -> &'static str {
        match self {
            Self::Http => "http",
            Self::Ws => "ws",
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "ws" => Self::Ws,
            _ => Self::Http,
        }
    }
}

pub type Kv = (String, String);

#[derive(Debug, Clone)]
pub struct HttpAttempt {
    pub request_id: Option<String>,
    pub request_name: Option<String>,
    pub collection_path: Option<String>,
    pub method: String,
    pub url: String,
    pub headers: Vec<Kv>,
    pub params: Vec<Kv>,
    pub body_type: String,
    pub body_content: String,
    pub env_active: Option<String>,
    pub env_snapshot: Vec<Kv>,
    pub replay_of_id: Option<EntryId>,
    pub tags: Option<String>,
}

#[derive(Debug, Clone)]
pub struct HttpResult {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<Kv>,
    pub body: Vec<u8>,
    pub is_binary: bool,
    pub time_ms: u64,
}

#[derive(Debug, Clone)]
pub struct WsAttempt {
    pub request_id: Option<String>,
    pub request_name: Option<String>,
    pub collection_path: Option<String>,
    pub url: String,
    pub headers: Vec<Kv>,
    pub env_active: Option<String>,
    pub env_snapshot: Vec<Kv>,
}

#[derive(Debug, Clone)]
pub struct WsClose {
    pub code: Option<u16>,
    pub reason: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub request_id: Option<String>,
    pub request_name: Option<String>,
    pub collection_path: Option<String>,
    pub protocol: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<Kv>,
    pub params: Vec<Kv>,
    pub body_type: Option<String>,
    pub body_preview: Option<String>,
    pub body_blob_sha256: Option<String>,
    pub body_size_bytes: Option<i64>,
    pub env_active: Option<String>,
    pub env_snapshot: Vec<Kv>,
    pub status: Option<i64>,
    pub status_text: Option<String>,
    pub response_headers: Vec<Kv>,
    pub response_preview: Option<String>,
    pub response_blob_sha256: Option<String>,
    pub response_size_bytes: Option<i64>,
    pub response_truncated: bool,
    pub response_time_ms: Option<i64>,
    pub error: Option<String>,
    pub started_at_ms: i64,
    pub finished_at_ms: Option<i64>,
    pub replay_of_id: Option<String>,
    pub tags: Option<String>,
    pub schema_version: i64,
    pub payload_sha256: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFilter {
    pub request_id: Option<String>,
    pub protocol: Option<String>,
    pub since_ms: Option<i64>,
    pub until_ms: Option<i64>,
    pub limit: Option<i64>,
    pub query: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RetentionPolicy {
    pub max_age_days: i64,
    pub max_entries: i64,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            max_age_days: 30,
            max_entries: 10_000,
        }
    }
}

#[derive(Clone)]
pub struct HistoryStore {
    inner: Arc<Mutex<Connection>>,
    blob_dir: PathBuf,
    workspace_hash: String,
    redaction: Arc<RedactionConfig>,
}

impl HistoryStore {
    /// Open (or create) the per-workspace history store.
    ///
    /// # Errors
    /// Returns an error if the data dir can't be resolved, created with the
    /// right permissions, or if the DB can't be opened.
    pub fn open(
        workspace_path: &str,
        base_dir: Option<&Path>,
    ) -> Result<Self, HistoryError> {
        let workspace_hash = hash_workspace_path(workspace_path);
        let root = resolve_root(base_dir)?;
        let ws_dir = root
            .join("workspaces")
            .join(&workspace_hash);
        let blob_dir = ws_dir.join("blobs");
        fs::create_dir_all(&blob_dir)?;
        set_dir_perms(&ws_dir)?;
        set_dir_perms(&blob_dir)?;

        let db_path = ws_dir.join("history.db");
        let conn = Connection::open(&db_path)?;
        set_file_perms(&db_path)?;

        conn.execute_batch(SCHEMA_SQL)?;
        conn.execute(
            "INSERT INTO meta(key, value) VALUES('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SCHEMA_VERSION.to_string()],
        )?;

        Ok(Self {
            inner: Arc::new(Mutex::new(conn)),
            blob_dir,
            workspace_hash,
            redaction: Arc::new(RedactionConfig::default()),
        })
    }

    #[must_use]
    pub fn workspace_hash(&self) -> &str {
        &self.workspace_hash
    }

    #[must_use]
    pub fn blob_dir(&self) -> &Path {
        &self.blob_dir
    }

    pub fn set_redaction(&mut self, cfg: RedactionConfig) {
        self.redaction = Arc::new(cfg);
    }

    /// Insert a `started_at` row before the request is dispatched. Even if
    /// the caller crashes before finalizing, the in-flight row remains
    /// visible (with `finished_at_ms IS NULL`).
    ///
    /// # Errors
    /// Returns an error if the DB can't be written.
    pub fn begin_http(&self, attempt: &HttpAttempt) -> Result<EntryId, HistoryError> {
        let now = epoch_ms();
        let id = EntryId::new(now);

        let cfg = self.redaction.as_ref();
        let headers_red = redact_headers(&attempt.headers, cfg);
        let env_red = redact_env(&attempt.env_snapshot, cfg);

        let (body_inline, body_blob, body_size) =
            self.store_request_body(&attempt.body_type, &attempt.body_content, cfg)?;

        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO history_entry (
                id, request_id, request_name, collection_path, protocol, method, url,
                headers_json, params_json, body_type, body_inline, body_blob_sha256,
                body_size_bytes, env_active, env_snapshot_json,
                started_at_ms, replay_of_id, tags, schema_version
            ) VALUES (
                ?1, ?2, ?3, ?4, 'http', ?5, ?6,
                ?7, ?8, ?9, ?10, ?11,
                ?12, ?13, ?14,
                ?15, ?16, ?17, ?18
            )",
            params![
                id.0,
                attempt.request_id,
                attempt.request_name,
                attempt.collection_path,
                attempt.method.to_uppercase(),
                attempt.url,
                serde_json::to_string(&headers_red)?,
                serde_json::to_string(&attempt.params)?,
                attempt.body_type,
                body_inline,
                body_blob,
                body_size,
                attempt.env_active,
                serde_json::to_string(&env_red)?,
                i64::try_from(now).unwrap_or(i64::MAX),
                attempt.replay_of_id.as_ref().map(|e| e.0.clone()),
                attempt.tags,
                SCHEMA_VERSION,
            ],
        )?;
        Ok(id)
    }

    /// Finalize a started entry with a successful response.
    ///
    /// # Errors
    /// Writing the body blob or the DB row failed.
    pub fn finalize_http_ok(
        &self,
        id: &EntryId,
        result: &HttpResult,
    ) -> Result<(), HistoryError> {
        let cfg = self.redaction.as_ref();
        let headers_red = redact_headers(&result.headers, cfg);

        let (resp_inline, resp_blob, resp_size, truncated) =
            self.store_response_body(&result.body, result.is_binary)?;

        let now = epoch_ms();

        let payload_hash = compute_payload_hash(
            &id.0,
            &result.status.to_string(),
            &result.body[..result.body.len().min(64 * 1024)],
        );

        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE history_entry SET
                status = ?2,
                status_text = ?3,
                response_headers_json = ?4,
                response_inline = ?5,
                response_blob_sha256 = ?6,
                response_size_bytes = ?7,
                response_truncated = ?8,
                response_time_ms = ?9,
                finished_at_ms = ?10,
                payload_sha256 = ?11,
                error = NULL
             WHERE id = ?1",
            params![
                id.0,
                i64::from(result.status),
                result.status_text,
                serde_json::to_string(&headers_red)?,
                resp_inline,
                resp_blob,
                resp_size,
                i64::from(truncated),
                i64::try_from(result.time_ms).unwrap_or(i64::MAX),
                i64::try_from(now).unwrap_or(i64::MAX),
                payload_hash,
            ],
        )?;
        Ok(())
    }

    /// Finalize a started entry with a failure.
    ///
    /// # Errors
    /// DB write failure.
    pub fn finalize_http_err(&self, id: &EntryId, err: &str) -> Result<(), HistoryError> {
        let now = epoch_ms();
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE history_entry SET
                error = ?2,
                finished_at_ms = ?3
             WHERE id = ?1",
            params![
                id.0,
                err,
                i64::try_from(now).unwrap_or(i64::MAX),
            ],
        )?;
        Ok(())
    }

    /// Begin a WebSocket connection record.
    ///
    /// # Errors
    /// DB write failure.
    pub fn begin_ws(&self, attempt: &WsAttempt) -> Result<EntryId, HistoryError> {
        let now = epoch_ms();
        let id = EntryId::new(now);
        let cfg = self.redaction.as_ref();
        let headers_red = redact_headers(&attempt.headers, cfg);
        let env_red = redact_env(&attempt.env_snapshot, cfg);

        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO history_entry (
                id, request_id, request_name, collection_path, protocol, method, url,
                headers_json, params_json, body_type, env_active, env_snapshot_json,
                started_at_ms, schema_version
            ) VALUES (
                ?1, ?2, ?3, ?4, 'ws', 'CONNECT', ?5,
                ?6, '[]', NULL, ?7, ?8,
                ?9, ?10
            )",
            params![
                id.0,
                attempt.request_id,
                attempt.request_name,
                attempt.collection_path,
                attempt.url,
                serde_json::to_string(&headers_red)?,
                attempt.env_active,
                serde_json::to_string(&env_red)?,
                i64::try_from(now).unwrap_or(i64::MAX),
                SCHEMA_VERSION,
            ],
        )?;
        Ok(id)
    }

    /// Finalize a WS connection record on close.
    ///
    /// # Errors
    /// DB write failure.
    pub fn finalize_ws(&self, id: &EntryId, close: &WsClose) -> Result<(), HistoryError> {
        let now = epoch_ms();
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE history_entry SET
                status = ?2,
                status_text = ?3,
                error = ?4,
                finished_at_ms = ?5
             WHERE id = ?1",
            params![
                id.0,
                close.code.map(i64::from),
                close.reason,
                close.error,
                i64::try_from(now).unwrap_or(i64::MAX),
            ],
        )?;
        Ok(())
    }

    /// Record a single WebSocket message (sent / received / system).
    ///
    /// # Errors
    /// DB write failure.
    pub fn record_ws_message(
        &self,
        entry_id: &EntryId,
        direction: &str,
        data: &[u8],
        is_binary: bool,
    ) -> Result<(), HistoryError> {
        let now = epoch_ms();
        let msg_id = Uuid::new_v4().to_string();
        let size_bytes = i64::try_from(data.len()).unwrap_or(i64::MAX);

        let (inline, blob) = if !is_binary && data.len() <= 4096 {
            (Some(String::from_utf8_lossy(data).into_owned()), None)
        } else {
            let sha = self.write_blob(data)?;
            (None, Some(sha))
        };

        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO ws_message (id, entry_id, direction, data_inline, data_blob_sha256, size_bytes, is_binary, ts_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                msg_id,
                entry_id.0,
                direction,
                inline,
                blob,
                size_bytes,
                i64::from(is_binary),
                i64::try_from(now).unwrap_or(i64::MAX),
            ],
        )?;
        Ok(())
    }

    /// List history entries (most recent first).
    ///
    /// # Errors
    /// DB read failure.
    pub fn list(&self, filter: &HistoryFilter) -> Result<Vec<HistoryEntry>, HistoryError> {
        let conn = self.lock_conn()?;
        let mut sql = String::from(
            "SELECT id, request_id, request_name, collection_path, protocol, method, url,
                    headers_json, params_json, body_type, body_inline, body_blob_sha256,
                    body_size_bytes, env_active, env_snapshot_json,
                    status, status_text, response_headers_json, response_inline,
                    response_blob_sha256, response_size_bytes, response_truncated,
                    response_time_ms, error, started_at_ms, finished_at_ms,
                    replay_of_id, tags, schema_version, payload_sha256
             FROM history_entry WHERE 1=1",
        );
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![];

        if let Some(ref rid) = filter.request_id {
            sql.push_str(" AND request_id = ?");
            args.push(Box::new(rid.clone()));
        }
        if let Some(ref proto) = filter.protocol {
            sql.push_str(" AND protocol = ?");
            args.push(Box::new(proto.clone()));
        }
        if let Some(since) = filter.since_ms {
            sql.push_str(" AND started_at_ms >= ?");
            args.push(Box::new(since));
        }
        if let Some(until) = filter.until_ms {
            sql.push_str(" AND started_at_ms <= ?");
            args.push(Box::new(until));
        }
        if let Some(ref q) = filter.query {
            sql.push_str(" AND (url LIKE ? OR request_name LIKE ?)");
            let pat = format!("%{q}%");
            args.push(Box::new(pat.clone()));
            args.push(Box::new(pat));
        }
        sql.push_str(" ORDER BY started_at_ms DESC LIMIT ?");
        args.push(Box::new(filter.limit.unwrap_or(200)));

        let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(std::convert::AsRef::as_ref).collect();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(refs.as_slice(), row_to_entry)?;

        let mut out = vec![];
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Fetch a single entry by id.
    ///
    /// # Errors
    /// DB read failure.
    pub fn get(&self, id: &EntryId) -> Result<Option<HistoryEntry>, HistoryError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, request_id, request_name, collection_path, protocol, method, url,
                    headers_json, params_json, body_type, body_inline, body_blob_sha256,
                    body_size_bytes, env_active, env_snapshot_json,
                    status, status_text, response_headers_json, response_inline,
                    response_blob_sha256, response_size_bytes, response_truncated,
                    response_time_ms, error, started_at_ms, finished_at_ms,
                    replay_of_id, tags, schema_version, payload_sha256
             FROM history_entry WHERE id = ?1",
        )?;
        let row = stmt
            .query_row(params![id.0], row_to_entry)
            .optional()?;
        Ok(row)
    }

    /// Read a stored blob by its sha256 filename.
    ///
    /// # Errors
    /// I/O failure or missing blob.
    pub fn read_blob(&self, sha: &str) -> Result<Vec<u8>, HistoryError> {
        let path = self.blob_dir.join(format!("{sha}.bin"));
        Ok(fs::read(path)?)
    }

    /// Delete a single entry plus any unreferenced blobs.
    ///
    /// # Errors
    /// DB / I/O failure.
    pub fn delete(&self, id: &EntryId) -> Result<(), HistoryError> {
        let blobs_to_check: Vec<String> = {
            let conn = self.lock_conn()?;
            let mut stmt = conn.prepare(
                "SELECT body_blob_sha256 FROM history_entry WHERE id = ?1
                 UNION ALL
                 SELECT response_blob_sha256 FROM history_entry WHERE id = ?1
                 UNION ALL
                 SELECT data_blob_sha256 FROM ws_message WHERE entry_id = ?1",
            )?;
            let rows = stmt.query_map(params![id.0], |r| r.get::<_, Option<String>>(0))?;
            let mut v = vec![];
            for r in rows {
                if let Some(s) = r? {
                    v.push(s);
                }
            }
            v
        };

        {
            let conn = self.lock_conn()?;
            conn.execute("DELETE FROM ws_message WHERE entry_id = ?1", params![id.0])?;
            conn.execute("DELETE FROM history_entry WHERE id = ?1", params![id.0])?;
        }

        self.gc_blobs(&blobs_to_check)?;
        Ok(())
    }

    /// Delete every entry. Blobs are GC'd afterwards.
    ///
    /// # Errors
    /// DB / I/O failure.
    pub fn clear(&self) -> Result<(), HistoryError> {
        {
            let conn = self.lock_conn()?;
            conn.execute("DELETE FROM ws_message", [])?;
            conn.execute("DELETE FROM history_entry", [])?;
        }
        if self.blob_dir.is_dir() {
            for entry in fs::read_dir(&self.blob_dir)? {
                let entry = entry?;
                let p = entry.path();
                if p.is_file() {
                    let _ = fs::remove_file(p);
                }
            }
        }
        Ok(())
    }

    /// Apply the retention policy: prune by age then by count, then GC blobs.
    ///
    /// # Errors
    /// DB / I/O failure.
    pub fn enforce_retention(&self, policy: &RetentionPolicy) -> Result<usize, HistoryError> {
        let now = i64::try_from(epoch_ms()).unwrap_or(i64::MAX);
        let cutoff = now.saturating_sub(policy.max_age_days.saturating_mul(86_400_000));

        let deleted = {
            let conn = self.lock_conn()?;
            let by_age = conn.execute(
                "DELETE FROM history_entry WHERE started_at_ms < ?1",
                params![cutoff],
            )?;
            let by_count = conn.execute(
                "DELETE FROM history_entry
                 WHERE id IN (
                     SELECT id FROM history_entry
                     ORDER BY started_at_ms DESC
                     LIMIT -1 OFFSET ?1
                 )",
                params![policy.max_entries],
            )?;
            by_age + by_count
        };
        self.gc_all_orphan_blobs()?;
        Ok(deleted)
    }

    fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, HistoryError> {
        self.inner
            .lock()
            .map_err(|_| HistoryError::Db("history mutex poisoned".into()))
    }

    fn store_request_body(
        &self,
        body_type: &str,
        content: &str,
        cfg: &RedactionConfig,
    ) -> Result<(Option<String>, Option<String>, Option<i64>), HistoryError> {
        if content.is_empty() {
            return Ok((None, None, Some(0)));
        }
        let bytes = content.as_bytes();
        let size = i64::try_from(bytes.len()).unwrap_or(i64::MAX);

        let textual = matches!(body_type, "json" | "text" | "x-www-form-urlencoded");
        let stored_text = if textual {
            super::redact::redact_body_smart(content, cfg)
        } else {
            content.to_string()
        };
        let stored_bytes = stored_text.as_bytes();

        if textual && stored_bytes.len() <= BODY_INLINE_THRESHOLD {
            return Ok((Some(stored_text), None, Some(size)));
        }
        let sha = self.write_blob(stored_bytes)?;
        Ok((None, Some(sha), Some(size)))
    }

    fn store_response_body(
        &self,
        body: &[u8],
        is_binary: bool,
    ) -> Result<(Option<String>, Option<String>, Option<i64>, bool), HistoryError> {
        let original_size = i64::try_from(body.len()).unwrap_or(i64::MAX);
        let truncated = body.len() > BODY_MAX_BYTES;
        let to_store: &[u8] = if truncated { &body[..BODY_MAX_BYTES] } else { body };

        if to_store.is_empty() {
            return Ok((None, None, Some(0), false));
        }

        if !is_binary && to_store.len() <= BODY_INLINE_THRESHOLD {
            let s = String::from_utf8_lossy(to_store).into_owned();
            return Ok((Some(s), None, Some(original_size), truncated));
        }

        let sha = self.write_blob(to_store)?;
        Ok((None, Some(sha), Some(original_size), truncated))
    }

    fn write_blob(&self, bytes: &[u8]) -> Result<String, HistoryError> {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let digest = hasher.finalize();
        let sha_hex = hex::encode(digest);

        let target = self.blob_dir.join(format!("{sha_hex}.bin"));
        if target.exists() {
            return Ok(sha_hex);
        }

        let tmp = self
            .blob_dir
            .join(format!(".{sha_hex}.{}.tmp", Uuid::new_v4()));
        {
            let mut f = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&tmp)?;
            f.write_all(bytes)?;
            f.sync_all()?;
        }
        set_file_perms(&tmp)?;
        fs::rename(&tmp, &target)?;
        Ok(sha_hex)
    }

    fn gc_blobs(&self, candidates: &[String]) -> Result<(), HistoryError> {
        for sha in candidates {
            let still_referenced: bool = {
                let conn = self.lock_conn()?;
                let count: i64 = conn.query_row(
                    "SELECT
                        (SELECT COUNT(*) FROM history_entry WHERE body_blob_sha256 = ?1)
                      + (SELECT COUNT(*) FROM history_entry WHERE response_blob_sha256 = ?1)
                      + (SELECT COUNT(*) FROM ws_message WHERE data_blob_sha256 = ?1)",
                    params![sha],
                    |r| r.get(0),
                )?;
                count > 0
            };
            if !still_referenced {
                let path = self.blob_dir.join(format!("{sha}.bin"));
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    }

    fn gc_all_orphan_blobs(&self) -> Result<(), HistoryError> {
        if !self.blob_dir.is_dir() {
            return Ok(());
        }
        let entries = fs::read_dir(&self.blob_dir)?;
        let mut candidates: Vec<String> = vec![];
        for e in entries.flatten() {
            let p = e.path();
            if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                if p.extension().is_some_and(|x| x == "bin") {
                    candidates.push(stem.to_string());
                }
            }
        }
        self.gc_blobs(&candidates)
    }
}

fn resolve_root(base_dir: Option<&Path>) -> Result<PathBuf, HistoryError> {
    if let Some(b) = base_dir {
        let p = b.join("history");
        fs::create_dir_all(&p)?;
        return Ok(p);
    }
    let data = dirs::data_dir().ok_or_else(|| {
        HistoryError::Io("could not resolve platform data dir".into())
    })?;
    let p = data.join(APP_DIR_NAME).join("history");
    fs::create_dir_all(&p)?;
    Ok(p)
}

fn hash_workspace_path(p: &str) -> String {
    let canonical = fs::canonicalize(p)
        .map(|pb| pb.to_string_lossy().into_owned())
        .unwrap_or_else(|_| p.to_string());
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    let digest = hasher.finalize();
    hex::encode(&digest[..8])
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

fn compute_payload_hash(id: &str, status: &str, body_sample: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(id.as_bytes());
    h.update(b"\0");
    h.update(status.as_bytes());
    h.update(b"\0");
    h.update(body_sample);
    hex::encode(h.finalize())
}

#[cfg(unix)]
fn set_dir_perms(path: &Path) -> Result<(), HistoryError> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(0o700);
    fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_dir_perms(_path: &Path) -> Result<(), HistoryError> {
    Ok(())
}

#[cfg(unix)]
fn set_file_perms(path: &Path) -> Result<(), HistoryError> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_file_perms(_path: &Path) -> Result<(), HistoryError> {
    Ok(())
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
    let headers_json: String = row.get(7)?;
    let params_json: String = row.get(8)?;
    let env_snapshot_json: String = row.get(14)?;
    let response_headers_json: Option<String> = row.get(17)?;

    let headers: Vec<Kv> = serde_json::from_str(&headers_json).unwrap_or_default();
    let params: Vec<Kv> = serde_json::from_str(&params_json).unwrap_or_default();
    let env_snapshot: Vec<Kv> = serde_json::from_str(&env_snapshot_json).unwrap_or_default();
    let response_headers: Vec<Kv> = response_headers_json
        .as_deref()
        .map(|s| serde_json::from_str(s).unwrap_or_default())
        .unwrap_or_default();

    let protocol_str: String = row.get(4)?;
    let response_truncated_int: i64 = row.get(21)?;

    Ok(HistoryEntry {
        id: row.get(0)?,
        request_id: row.get(1)?,
        request_name: row.get(2)?,
        collection_path: row.get(3)?,
        protocol: EntryProtocol::parse(&protocol_str).as_str().to_string(),
        method: row.get(5)?,
        url: row.get(6)?,
        headers,
        params,
        body_type: row.get(9)?,
        body_preview: row.get(10)?,
        body_blob_sha256: row.get(11)?,
        body_size_bytes: row.get(12)?,
        env_active: row.get(13)?,
        env_snapshot,
        status: row.get(15)?,
        status_text: row.get(16)?,
        response_headers,
        response_preview: row.get(18)?,
        response_blob_sha256: row.get(19)?,
        response_size_bytes: row.get(20)?,
        response_truncated: response_truncated_int != 0,
        response_time_ms: row.get(22)?,
        error: row.get(23)?,
        started_at_ms: row.get(24)?,
        finished_at_ms: row.get(25)?,
        replay_of_id: row.get(26)?,
        tags: row.get(27)?,
        schema_version: row.get(28)?,
        payload_sha256: row.get(29)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_store() -> (HistoryStore, TempDir, TempDir) {
        let base = TempDir::new().expect("tmp");
        let ws = TempDir::new().expect("tmp ws");
        let store = HistoryStore::open(
            ws.path().to_string_lossy().as_ref(),
            Some(base.path()),
        )
        .expect("open store");
        (store, base, ws)
    }

    fn sample_http_attempt() -> HttpAttempt {
        HttpAttempt {
            request_id: Some("req-1".into()),
            request_name: Some("List users".into()),
            collection_path: Some("api.json".into()),
            method: "get".into(),
            url: "https://example.test/users?id=1".into(),
            headers: vec![
                ("Authorization".into(), "Bearer secret-token".into()),
                ("Accept".into(), "application/json".into()),
            ],
            params: vec![("id".into(), "1".into())],
            body_type: "none".into(),
            body_content: String::new(),
            env_active: Some("local".into()),
            env_snapshot: vec![
                ("BASE_URL".into(), "https://example.test".into()),
                ("API_TOKEN".into(), "verysecret".into()),
            ],
            replay_of_id: None,
            tags: None,
        }
    }

    #[test]
    fn open_creates_db_and_blobs_dir() {
        let (store, _b, _w) = make_store();
        assert!(store.blob_dir().is_dir());
        assert!(!store.workspace_hash().is_empty());
    }

    #[test]
    fn begin_persists_inflight_row_visible_before_finalize() {
        let (store, _b, _w) = make_store();
        let id = store.begin_http(&sample_http_attempt()).expect("begin");
        let entry = store.get(&id).expect("get").expect("entry");
        assert_eq!(entry.method, "GET");
        assert!(entry.finished_at_ms.is_none());
        assert!(entry.status.is_none());
        // Auth header must be redacted on read-back.
        let auth = entry
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("authorization"))
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        assert!(auth.starts_with("***redacted"));
        // Sensitive env var must be redacted.
        let tok = entry
            .env_snapshot
            .iter()
            .find(|(k, _)| k == "API_TOKEN")
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        assert!(tok.starts_with("***redacted"));
    }

    #[test]
    fn finalize_ok_records_status_and_response() {
        let (store, _b, _w) = make_store();
        let id = store.begin_http(&sample_http_attempt()).expect("begin");
        store
            .finalize_http_ok(
                &id,
                &HttpResult {
                    status: 200,
                    status_text: "OK".into(),
                    headers: vec![
                        ("Content-Type".into(), "application/json".into()),
                        ("Set-Cookie".into(), "session=abc".into()),
                    ],
                    body: br#"{"id":1,"name":"alice"}"#.to_vec(),
                    is_binary: false,
                    time_ms: 42,
                },
            )
            .expect("finalize");

        let e = store.get(&id).expect("get").expect("entry");
        assert_eq!(e.status, Some(200));
        assert_eq!(e.status_text.as_deref(), Some("OK"));
        assert!(e.finished_at_ms.is_some());
        // Set-Cookie must be redacted.
        let sc = e.response_headers.iter().find(|(k, _)| k == "Set-Cookie");
        assert!(sc.unwrap().1.starts_with("***redacted"));
        assert!(e.payload_sha256.is_some());
    }

    #[test]
    fn finalize_err_records_error() {
        let (store, _b, _w) = make_store();
        let id = store.begin_http(&sample_http_attempt()).expect("begin");
        store.finalize_http_err(&id, "connection refused").expect("err");
        let e = store.get(&id).expect("get").expect("entry");
        assert_eq!(e.error.as_deref(), Some("connection refused"));
        assert!(e.finished_at_ms.is_some());
    }

    #[test]
    fn large_response_goes_to_blob_and_is_readable() {
        let (store, _b, _w) = make_store();
        let id = store.begin_http(&sample_http_attempt()).expect("begin");
        let big = vec![b'x'; 200 * 1024]; // 200 KB
        store
            .finalize_http_ok(
                &id,
                &HttpResult {
                    status: 200,
                    status_text: "OK".into(),
                    headers: vec![],
                    body: big.clone(),
                    is_binary: false,
                    time_ms: 1,
                },
            )
            .expect("finalize");
        let e = store.get(&id).expect("get").expect("entry");
        let sha = e.response_blob_sha256.expect("blob");
        let read_back = store.read_blob(&sha).expect("read");
        assert_eq!(read_back.len(), big.len());
    }

    #[test]
    fn truncates_oversized_response() {
        let (store, _b, _w) = make_store();
        let id = store.begin_http(&sample_http_attempt()).expect("begin");
        let huge = vec![b'x'; (BODY_MAX_BYTES) + 1024];
        store
            .finalize_http_ok(
                &id,
                &HttpResult {
                    status: 200,
                    status_text: "OK".into(),
                    headers: vec![],
                    body: huge.clone(),
                    is_binary: true,
                    time_ms: 1,
                },
            )
            .expect("finalize");
        let e = store.get(&id).expect("get").expect("entry");
        assert!(e.response_truncated);
        assert_eq!(e.response_size_bytes, Some(i64::try_from(huge.len()).unwrap_or(0)));
    }

    #[test]
    fn list_filters_and_orders_recent_first() {
        let (store, _b, _w) = make_store();
        // Insert three entries.
        for i in 0..3 {
            let mut a = sample_http_attempt();
            a.request_name = Some(format!("call-{i}"));
            let id = store.begin_http(&a).expect("begin");
            // Stagger started_at_ms manually so ordering is unambiguous.
            {
                let conn = store.lock_conn().unwrap();
                conn.execute(
                    "UPDATE history_entry SET started_at_ms = ? WHERE id = ?",
                    params![1_000 + i64::from(i), id.0],
                )
                .unwrap();
            }
        }
        let entries = store
            .list(&HistoryFilter {
                limit: Some(10),
                ..Default::default()
            })
            .expect("list");
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].request_name.as_deref(), Some("call-2"));
        assert_eq!(entries[2].request_name.as_deref(), Some("call-0"));
    }

    #[test]
    fn delete_removes_entry_and_orphan_blobs() {
        let (store, _b, _w) = make_store();
        let id = store.begin_http(&sample_http_attempt()).expect("begin");
        store
            .finalize_http_ok(
                &id,
                &HttpResult {
                    status: 200,
                    status_text: "OK".into(),
                    headers: vec![],
                    body: vec![b'a'; 200 * 1024],
                    is_binary: false,
                    time_ms: 1,
                },
            )
            .expect("finalize");
        let e = store.get(&id).expect("get").expect("entry");
        let sha = e.response_blob_sha256.clone().expect("blob");
        let blob_path = store.blob_dir().join(format!("{sha}.bin"));
        assert!(blob_path.is_file());

        store.delete(&id).expect("delete");
        assert!(store.get(&id).expect("get").is_none());
        assert!(!blob_path.exists());
    }

    #[test]
    fn clear_wipes_everything() {
        let (store, _b, _w) = make_store();
        for _ in 0..5 {
            let id = store.begin_http(&sample_http_attempt()).expect("begin");
            store.finalize_http_err(&id, "x").expect("err");
        }
        store.clear().expect("clear");
        let entries = store.list(&HistoryFilter::default()).expect("list");
        assert!(entries.is_empty());
    }

    #[test]
    fn retention_prunes_old_entries() {
        let (store, _b, _w) = make_store();
        let id = store.begin_http(&sample_http_attempt()).expect("begin");
        // Push started_at back beyond max_age_days.
        {
            let conn = store.lock_conn().unwrap();
            conn.execute(
                "UPDATE history_entry SET started_at_ms = 0 WHERE id = ?",
                params![id.0],
            )
            .unwrap();
        }
        let pruned = store
            .enforce_retention(&RetentionPolicy::default())
            .expect("retain");
        assert_eq!(pruned, 1);
        assert!(store.get(&id).expect("get").is_none());
    }

    #[test]
    fn ws_lifecycle_records_attempt_messages_and_close() {
        let (store, _b, _w) = make_store();
        let id = store
            .begin_ws(&WsAttempt {
                request_id: None,
                request_name: Some("chat".into()),
                collection_path: None,
                url: "wss://example.test/socket".into(),
                headers: vec![("Sec-WebSocket-Protocol".into(), "chat".into())],
                env_active: None,
                env_snapshot: vec![],
            })
            .expect("begin ws");

        store
            .record_ws_message(&id, "sent", b"hello", false)
            .expect("rec");
        store
            .record_ws_message(&id, "received", b"world", false)
            .expect("rec");

        store
            .finalize_ws(
                &id,
                &WsClose {
                    code: Some(1000),
                    reason: "bye".into(),
                    error: None,
                },
            )
            .expect("close");

        let e = store.get(&id).expect("get").expect("entry");
        assert_eq!(e.protocol, "ws");
        assert_eq!(e.status, Some(1000));
        assert_eq!(e.status_text.as_deref(), Some("bye"));
    }
}
