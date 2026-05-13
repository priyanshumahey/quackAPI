//! Secret redaction. All redaction is performed *before* a value is written
//! to the history store; raw secret material must never touch disk.
//!
//! A redacted value is replaced with `***redacted(sha8:abcd1234)***` – the
//! first 8 hex chars of the SHA-256 of the original value, so the user can
//! tell whether two requests used the same token without exposing it.

use sha2::{Digest, Sha256};

pub const DEFAULT_REDACTED_HEADERS: &[&str] = &[
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
    "x-csrf-token",
    "x-amz-security-token",
];

/// Env-variable name fragments matched case-insensitively as substrings.
pub const DEFAULT_REDACTED_ENV_FRAGMENTS: &[&str] = &[
    "token",
    "secret",
    "password",
    "passwd",
    "apikey",
    "api_key",
    "auth",
    "bearer",
    "credential",
    "private",
];

#[derive(Debug, Clone)]
pub struct RedactionConfig {
    pub header_names: Vec<String>,
    pub env_fragments: Vec<String>,
    pub enabled: bool,
}

impl Default for RedactionConfig {
    fn default() -> Self {
        Self {
            header_names: DEFAULT_REDACTED_HEADERS.iter().map(|s| (*s).to_string()).collect(),
            env_fragments: DEFAULT_REDACTED_ENV_FRAGMENTS
                .iter()
                .map(|s| (*s).to_string())
                .collect(),
            enabled: true,
        }
    }
}

/// Returns the redacted placeholder for `value`. Empty values pass through.
#[must_use]
pub fn redact_value(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let digest = hasher.finalize();
    let short = hex::encode(&digest[..4]);
    format!("***redacted(sha8:{short})***")
}

#[must_use]
pub fn is_sensitive_header(name: &str, cfg: &RedactionConfig) -> bool {
    if !cfg.enabled {
        return false;
    }
    let lower = name.to_ascii_lowercase();
    cfg.header_names.iter().any(|h| h.eq_ignore_ascii_case(&lower))
}

#[must_use]
pub fn is_sensitive_env_name(name: &str, cfg: &RedactionConfig) -> bool {
    if !cfg.enabled {
        return false;
    }
    let lower = name.to_ascii_lowercase();
    cfg.env_fragments.iter().any(|frag| lower.contains(&frag.to_ascii_lowercase()))
}

/// Redact a list of `(name, value)` header pairs in place-of-copy.
#[must_use]
pub fn redact_headers(
    headers: &[(String, String)],
    cfg: &RedactionConfig,
) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|(k, v)| {
            if is_sensitive_header(k, cfg) {
                (k.clone(), redact_value(v))
            } else {
                (k.clone(), v.clone())
            }
        })
        .collect()
}

/// Redact env-variable pairs whose name matches a sensitive fragment.
#[must_use]
pub fn redact_env(env: &[(String, String)], cfg: &RedactionConfig) -> Vec<(String, String)> {
    env.iter()
        .map(|(k, v)| {
            if is_sensitive_env_name(k, cfg) {
                (k.clone(), redact_value(v))
            } else {
                (k.clone(), v.clone())
            }
        })
        .collect()
}

/// Best-effort body-scrub for embedded tokens. Matches `Bearer xxx` /
/// `Basic xxx` and JSON values for keys like `"token"`, `"password"`, etc.
#[must_use]
pub fn redact_body_smart(body: &str, cfg: &RedactionConfig) -> String {
    if !cfg.enabled || body.is_empty() {
        return body.to_string();
    }

    let bearer_pattern = r"(?i)(bearer|basic)\s+([A-Za-z0-9._\-+/=]{8,})";
    let mut out = match regex::Regex::new(bearer_pattern) {
        Ok(re) => re
            .replace_all(body, |caps: &regex::Captures| {
                let scheme = caps.get(1).map_or("", |m| m.as_str());
                let tok = caps.get(2).map_or("", |m| m.as_str());
                format!("{} {}", scheme, redact_value(tok))
            })
            .into_owned(),
        Err(_) => body.to_string(),
    };

    for frag in &cfg.env_fragments {
        let pattern = format!(
            r#"(?i)("[^"]*{}[^"]*")\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)""#,
            regex::escape(frag),
        );
        if let Ok(re) = regex::Regex::new(&pattern) {
            out = re
                .replace_all(&out, |caps: &regex::Captures| {
                    let key = caps.get(1).map_or("", |m| m.as_str());
                    let val = caps.get(2).map_or("", |m| m.as_str());
                    format!("{key}: \"{}\"", redact_value(val))
                })
                .into_owned();
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_well_known_headers() {
        let cfg = RedactionConfig::default();
        let headers = vec![
            ("Authorization".to_string(), "Bearer secret-token-abc".to_string()),
            ("Content-Type".to_string(), "application/json".to_string()),
            ("X-API-Key".to_string(), "abc123".to_string()),
        ];
        let out = redact_headers(&headers, &cfg);
        assert!(out[0].1.starts_with("***redacted"));
        assert_eq!(out[1].1, "application/json");
        assert!(out[2].1.starts_with("***redacted"));
    }

    #[test]
    fn same_value_same_hash() {
        assert_eq!(redact_value("hunter2"), redact_value("hunter2"));
        assert_ne!(redact_value("hunter2"), redact_value("hunter3"));
    }

    #[test]
    fn empty_value_passthrough() {
        assert_eq!(redact_value(""), "");
    }

    #[test]
    fn redacts_sensitive_env_names() {
        let cfg = RedactionConfig::default();
        let env = vec![
            ("BASE_URL".to_string(), "http://localhost".to_string()),
            ("API_TOKEN".to_string(), "xyz".to_string()),
            ("DB_PASSWORD".to_string(), "p".to_string()),
            ("MY_AUTH_KEY".to_string(), "k".to_string()),
        ];
        let out = redact_env(&env, &cfg);
        assert_eq!(out[0].1, "http://localhost");
        assert!(out[1].1.starts_with("***"));
        assert!(out[2].1.starts_with("***"));
        assert!(out[3].1.starts_with("***"));
    }

    #[test]
    fn redacts_bearer_in_body() {
        let cfg = RedactionConfig::default();
        let body = r#"{"hint":"Authorization Bearer abc12345xyz"}"#;
        let out = redact_body_smart(body, &cfg);
        assert!(out.contains("***redacted"));
        assert!(!out.contains("abc12345xyz"));
    }

    #[test]
    fn redaction_off_passthrough() {
        let mut cfg = RedactionConfig::default();
        cfg.enabled = false;
        let headers = vec![("Authorization".to_string(), "Bearer x".to_string())];
        let out = redact_headers(&headers, &cfg);
        assert_eq!(out[0].1, "Bearer x");
    }
}
