//! Per-workspace history store for HTTP / WebSocket calls.

pub mod redact;
pub mod store;

pub use redact::{redact_headers, redact_env, RedactionConfig};
pub use store::{
    EntryId, EntryProtocol, HistoryError, HistoryEntry, HistoryFilter, HistoryStore, HttpAttempt,
    HttpResult, RetentionPolicy, WsAttempt, WsClose,
};
