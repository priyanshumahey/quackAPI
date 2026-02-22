use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;

const CLI_NAME: &str = "quack";
const INSTALL_DIR: &str = "/usr/local/bin";

fn bundled_cli_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Could not resolve resource directory: {e}"))?;

    // Tauri externalBin places the sidecar next to the main binary.
    // On macOS that's Contents/MacOS/ inside the .app bundle.
    // The resource_dir points to Contents/Resources, so go up one level.
    let macos_dir = resource_dir.parent().unwrap_or(&resource_dir).join("MacOS");

    // Tauri appends the target triple to the binary name in externalBin.
    // At runtime it ships without the suffix, just the plain name.
    let plain = macos_dir.join(CLI_NAME);
    if plain.exists() {
        return Ok(plain);
    }

    // Fallback: try with target triple suffix
    let target = current_target_triple();
    let with_triple = macos_dir.join(format!("{CLI_NAME}-{target}"));
    if with_triple.exists() {
        return Ok(with_triple);
    }

    Err(format!(
        "CLI binary not found. Looked at:\n  {}\n  {}",
        plain.display(),
        with_triple.display()
    ))
}

fn current_target_triple() -> String {
    let arch = std::env::consts::ARCH;
    let os = std::env::consts::OS;

    // Map Rust's consts to the target triple format
    let arch_part = match arch {
        "aarch64" => "aarch64",
        "x86_64" => "x86_64",
        other => other,
    };
    let os_part = match os {
        "macos" => "apple-darwin",
        "linux" => "unknown-linux-gnu",
        "windows" => "pc-windows-msvc",
        other => other,
    };
    format!("{arch_part}-{os_part}")
}

/// Check if the CLI is currently installed in PATH.
#[tauri::command]
pub fn check_cli_installed() -> Result<bool, String> {
    let dest = PathBuf::from(INSTALL_DIR).join(CLI_NAME);
    Ok(dest.exists())
}

/// Run a shell command with admin privileges via macOS's native password prompt.
#[cfg(target_os = "macos")]
fn run_with_admin(shell_cmd: &str) -> Result<(), String> {
    let script = format!(
        r#"do shell script "{}" with administrator privileges"#,
        shell_cmd.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to launch authorization prompt: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") || stderr.contains("-128") {
            Err("Installation cancelled.".to_string())
        } else {
            Err(format!("Command failed: {stderr}"))
        }
    }
}

/// Install the CLI by creating a symlink in /usr/local/bin.
/// Uses macOS's native admin password prompt for elevated permissions.
#[tauri::command]
pub fn install_cli(app: AppHandle) -> Result<String, String> {
    let cli_bin = bundled_cli_path(&app)?;
    let dest = PathBuf::from(INSTALL_DIR).join(CLI_NAME);

    // First try without sudo (works if user owns /usr/local/bin)
    let needs_sudo = {
        // Try creating parent dir
        if !PathBuf::from(INSTALL_DIR).is_dir() {
            fs::create_dir_all(INSTALL_DIR).is_err()
        } else {
            // Check if we can write to the directory
            let test_path = PathBuf::from(INSTALL_DIR).join(".quack-test");
            let can_write = fs::write(&test_path, "").is_ok();
            if can_write {
                let _ = fs::remove_file(&test_path);
            }
            !can_write
        }
    };

    if needs_sudo {
        #[cfg(target_os = "macos")]
        {
            let cmd = format!(
                "mkdir -p {} && ln -sf '{}' '{}'",
                INSTALL_DIR,
                cli_bin.display(),
                dest.display()
            );
            run_with_admin(&cmd)?;
        }

        #[cfg(not(target_os = "macos"))]
        {
            return Err(format!(
                "Permission denied. Please run manually:\n  sudo ln -sf {} {}",
                cli_bin.display(),
                dest.display()
            ));
        }
    } else {
        // Remove existing symlink/file if present
        if dest.exists() || dest.is_symlink() {
            fs::remove_file(&dest).map_err(|e| {
                format!("Failed to remove existing {}: {e}", dest.display())
            })?;
        }

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&cli_bin, &dest).map_err(|e| {
                format!("Failed to create symlink: {e}")
            })?;
        }

        #[cfg(windows)]
        {
            fs::copy(&cli_bin, &dest)
                .map_err(|e| format!("Failed to copy CLI binary: {e}"))?;
        }
    }

    Ok(format!(
        "CLI installed! You can now use `quack` from your terminal.\n\
         Symlink: {} → {}",
        dest.display(),
        cli_bin.display()
    ))
}

/// Uninstall the CLI by removing the symlink.
#[tauri::command]
pub fn uninstall_cli() -> Result<String, String> {
    let dest = PathBuf::from(INSTALL_DIR).join(CLI_NAME);

    if !dest.exists() && !dest.is_symlink() {
        return Ok("CLI is not installed.".to_string());
    }

    // Try without sudo first
    match fs::remove_file(&dest) {
        Ok(()) => return Ok("CLI uninstalled successfully.".to_string()),
        Err(_) => {
            #[cfg(target_os = "macos")]
            {
                let cmd = format!("rm -f '{}'", dest.display());
                run_with_admin(&cmd)?;
                return Ok("CLI uninstalled successfully.".to_string());
            }

            #[cfg(not(target_os = "macos"))]
            return Err(format!(
                "Permission denied. Please run manually:\n  sudo rm {}",
                dest.display()
            ));
        }
    }
}
