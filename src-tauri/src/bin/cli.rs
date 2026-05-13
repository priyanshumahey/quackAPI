use std::env;
use std::process;

use quack_lib::core;

fn print_usage() {
    eprintln!(
        r#"quack — run API requests from .quack collections

USAGE:
    quack list                          List all available requests
    quack run <request>                 Run a request by name or ID
    quack run <request> --verbose       Run with full response details

OPTIONS:
    -d, --dir <path>      Workspace directory (default: current directory)
    -h, --help            Show this help message
        --no-history      Do not record this run in the history store
        --history-tag T   Tag history entries (e.g. CI run id) for filtering

EXAMPLES:
    quack list
    quack run "Echo Request (GET)"
    quack run test-req-001
    quack run "Hello GET" --verbose
    quack run "Hello" -d /path/to/project
"#
    );
}

#[derive(Debug)]
struct CliArgs {
    command: Command,
    workspace_path: String,
    verbose: bool,
    no_history: bool,
    history_tag: Option<String>,
}

#[derive(Debug)]
enum Command {
    List,
    Run { query: String },
    Help,
}

fn parse_args() -> CliArgs {
    let args: Vec<String> = env::args().skip(1).collect();

    let mut workspace_path = env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());
    let mut verbose = false;
    let mut no_history = false;
    let mut history_tag: Option<String> = None;
    let mut positional: Vec<String> = vec![];

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-h" | "--help" => {
                return CliArgs {
                    command: Command::Help,
                    workspace_path,
                    verbose,
                    no_history,
                    history_tag,
                };
            }
            "-d" | "--dir" => {
                i += 1;
                if i < args.len() {
                    workspace_path = args[i].clone();
                } else {
                    eprintln!("Error: --dir requires a path argument");
                    process::exit(1);
                }
            }
            "-v" | "--verbose" => {
                verbose = true;
            }
            "--no-history" => {
                no_history = true;
            }
            "--history-tag" => {
                i += 1;
                if i < args.len() {
                    history_tag = Some(args[i].clone());
                } else {
                    eprintln!("Error: --history-tag requires a value");
                    process::exit(1);
                }
            }
            other => {
                positional.push(other.to_string());
            }
        }
        i += 1;
    }

    let command = match positional.first().map(|s| s.as_str()) {
        Some("list") | Some("ls") => Command::List,
        Some("run") | Some("r") => {
            if positional.len() < 2 {
                eprintln!("Error: 'run' requires a request name or ID");
                eprintln!("Usage: quack run <request-name-or-id>");
                process::exit(1);
            }
            Command::Run {
                query: positional[1..].join(" "),
            }
        }
        Some(unknown) => {
            eprintln!("Unknown command: {unknown}");
            print_usage();
            process::exit(1);
        }
        None => Command::Help,
    };

    CliArgs {
        command,
        workspace_path,
        verbose,
        no_history,
        history_tag,
    }
}

fn cmd_list(workspace_path: &str) {
    let requests = match core::collections::list_all_requests(workspace_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Error: {e}");
            process::exit(1);
        }
    };

    if requests.is_empty() {
        println!("No requests found in .quack/collections/");
        return;
    }

    let mut current_collection = String::new();
    for (col_name, col_path, req) in &requests {
        if *col_name != current_collection {
            if !current_collection.is_empty() {
                println!();
            }
            println!("\x1b[1;36m{col_name}\x1b[0m  \x1b[2m({col_path})\x1b[0m");
            current_collection = col_name.clone();
        }

        let method_color = match req.method.as_str() {
            "GET" => "\x1b[32m",    // green
            "POST" => "\x1b[33m",   // yellow
            "PUT" => "\x1b[34m",    // blue
            "PATCH" => "\x1b[35m",  // magenta
            "DELETE" => "\x1b[31m", // red
            _ => "\x1b[37m",        // white
        };
        println!(
            "  {method_color}{:>7}\x1b[0m  {}  \x1b[2m({})\x1b[0m",
            req.method, req.name, req.id
        );
    }
}

async fn cmd_run(
    workspace_path: &str,
    query: &str,
    verbose: bool,
    no_history: bool,
    history_tag: Option<String>,
) {
    let env_vars = match core::environments::resolve_env_vars(workspace_path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error loading environments: {e}");
            process::exit(1);
        }
    };

    let (col_path, details) = match core::collections::find_request(workspace_path, query) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("{e}");
            process::exit(1);
        }
    };

    let resolved_url = core::environments::substitute_env_vars(&details.url, &env_vars);
    let method_color = match details.method.as_str() {
        "GET" => "\x1b[32m",
        "POST" => "\x1b[33m",
        "PUT" => "\x1b[34m",
        "PATCH" => "\x1b[35m",
        "DELETE" => "\x1b[31m",
        _ => "\x1b[37m",
    };
    eprintln!(
        "{method_color}{}\x1b[0m {} \x1b[2m({})\x1b[0m",
        details.method, resolved_url, details.name
    );

    let history_handle = if no_history {
        None
    } else {
        open_cli_history_entry(workspace_path, &details, &col_path, &env_vars, history_tag.as_deref())
    };

    let response_result = core::http::execute_request(&details, &env_vars).await;

    let response = match response_result {
        Ok(r) => {
            if let Some((store, id)) = &history_handle {
                let headers_kv: Vec<(String, String)> = r
                    .headers
                    .iter()
                    .map(|h| (h.key.clone(), h.value.clone()))
                    .collect();
                let result = core::history::HttpResult {
                    status: r.status,
                    status_text: r.status_text.clone(),
                    headers: headers_kv,
                    body: r.body.as_bytes().to_vec(),
                    is_binary: false,
                    time_ms: r.time_ms,
                };
                let _ = store.finalize_http_ok(id, &result);
            }
            r
        }
        Err(e) => {
            if let Some((store, id)) = &history_handle {
                let _ = store.finalize_http_err(id, &e);
            }
            eprintln!("\x1b[31mError: {e}\x1b[0m");
            process::exit(1);
        }
    };

    if verbose {
        let status_color = if response.status < 300 {
            "\x1b[32m"
        } else if response.status < 400 {
            "\x1b[33m"
        } else {
            "\x1b[31m"
        };
        eprintln!(
            "\n{status_color}{} {}\x1b[0m  \x1b[2m({} ms, {} bytes)\x1b[0m",
            response.status, response.status_text, response.time_ms, response.size_bytes
        );

        eprintln!("\n\x1b[2m── Response Headers ──\x1b[0m");
        for h in &response.headers {
            eprintln!("  \x1b[36m{}\x1b[0m: {}", h.key, h.value);
        }
        eprintln!("\n\x1b[2m── Body ──\x1b[0m");
    } else {
        let status_color = if response.status < 300 {
            "\x1b[32m"
        } else if response.status < 400 {
            "\x1b[33m"
        } else {
            "\x1b[31m"
        };
        eprintln!(
            "{status_color}{} {}\x1b[0m  \x1b[2m{} ms\x1b[0m",
            response.status, response.status_text, response.time_ms
        );
    }

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&response.body) {
        if let Ok(pretty) = serde_json::to_string_pretty(&parsed) {
            println!("{pretty}");
            return;
        }
    }
    println!("{}", response.body);
}

fn open_cli_history_entry(
    workspace_path: &str,
    details: &core::collections::RequestDetails,
    col_path: &str,
    env_vars: &std::collections::HashMap<String, String>,
    tag: Option<&str>,
) -> Option<(core::history::HistoryStore, core::history::EntryId)> {
    let store = match core::history::HistoryStore::open(workspace_path, None) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("\x1b[2mhistory: open failed: {e}\x1b[0m");
            return None;
        }
    };

    let resolved_url = core::environments::substitute_env_vars(&details.url, env_vars);
    let headers: Vec<(String, String)> = details
        .headers
        .iter()
        .filter(|kv| kv.enabled)
        .map(|kv| {
            (
                core::environments::substitute_env_vars(&kv.key, env_vars),
                core::environments::substitute_env_vars(&kv.value, env_vars),
            )
        })
        .collect();
    let params: Vec<(String, String)> = details
        .params
        .iter()
        .filter(|kv| kv.enabled)
        .map(|kv| {
            (
                core::environments::substitute_env_vars(&kv.key, env_vars),
                core::environments::substitute_env_vars(&kv.value, env_vars),
            )
        })
        .collect();
    let env_snapshot: Vec<(String, String)> = env_vars
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let attempt = core::history::HttpAttempt {
        request_id: Some(details.id.clone()),
        request_name: Some(details.name.clone()),
        collection_path: Some(col_path.to_string()),
        method: details.method.clone(),
        url: resolved_url,
        headers,
        params,
        body_type: details.body.body_type.clone(),
        body_content: core::environments::substitute_env_vars(&details.body.content, env_vars),
        env_active: None,
        env_snapshot,
        replay_of_id: None,
        tags: tag.map(|t| t.to_string()),
    };

    match store.begin_http(&attempt) {
        Ok(id) => Some((store, id)),
        Err(e) => {
            eprintln!("\x1b[2mhistory: begin_http failed: {e}\x1b[0m");
            None
        }
    }
}

#[tokio::main]
async fn main() {
    let args = parse_args();

    match args.command {
        Command::Help => print_usage(),
        Command::List => cmd_list(&args.workspace_path),
        Command::Run { query } => {
            cmd_run(
                &args.workspace_path,
                &query,
                args.verbose,
                args.no_history,
                args.history_tag,
            )
            .await;
        }
    }
}
