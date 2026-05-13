PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS history_entry (
    id TEXT PRIMARY KEY,
    request_id TEXT,
    request_name TEXT,
    collection_path TEXT,
    protocol TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,

    headers_json TEXT NOT NULL,
    params_json TEXT NOT NULL,
    body_type TEXT,
    body_inline TEXT,
    body_blob_sha256 TEXT,
    body_size_bytes INTEGER,

    env_active TEXT,
    env_snapshot_json TEXT NOT NULL,

    status INTEGER,
    status_text TEXT,
    response_headers_json TEXT,
    response_inline TEXT,
    response_blob_sha256 TEXT,
    response_size_bytes INTEGER,
    response_truncated INTEGER NOT NULL DEFAULT 0,
    response_time_ms INTEGER,
    error TEXT,

    started_at_ms INTEGER NOT NULL,
    finished_at_ms INTEGER,
    replay_of_id TEXT,
    tags TEXT,

    schema_version INTEGER NOT NULL,
    payload_sha256 TEXT
);

CREATE INDEX IF NOT EXISTS ix_history_time ON history_entry(started_at_ms DESC);
CREATE INDEX IF NOT EXISTS ix_history_request ON history_entry(request_id, started_at_ms DESC);
CREATE INDEX IF NOT EXISTS ix_history_url ON history_entry(url);

CREATE TABLE IF NOT EXISTS ws_message (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    data_inline TEXT,
    data_blob_sha256 TEXT,
    size_bytes INTEGER NOT NULL,
    is_binary INTEGER NOT NULL DEFAULT 0,
    ts_ms INTEGER NOT NULL,
    FOREIGN KEY (entry_id) REFERENCES history_entry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_ws_message_entry ON ws_message(entry_id, ts_ms);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
