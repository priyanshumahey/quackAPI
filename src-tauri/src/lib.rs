use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    AppHandle, Manager, RunEvent, WindowEvent,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

pub(crate) struct AppExitControl {
    allow_exit: AtomicBool,
}

impl AppExitControl {
    fn new() -> Self {
        Self {
            allow_exit: AtomicBool::new(false),
        }
    }

    pub(crate) fn allow_exit(&self) {
        self.allow_exit.store(true, Ordering::SeqCst);
    }

    pub(crate) fn is_exit_allowed(&self) -> bool {
        self.allow_exit.load(Ordering::SeqCst)
    }
}

fn hide_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

/// Show the main window and restore the Dock icon.
fn show_main_window(app_handle: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn greet() -> String {
    let now = SystemTime::now();
    let epoch_ms = now
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("Hello world from Rust! Current epoch: {epoch_ms}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppExitControl::new())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|_pass| todo!()).build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
                    tauri::image::Image::new(&[], 0, 0)
                }))
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("quack-api")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "hide" => {
                        hide_main_window(app);
                    }
                    "quit" => {
                        if let Some(ctrl) = app.try_state::<AppExitControl>() {
                            ctrl.allow_exit();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match &event {
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                if label == "main" {
                    api.prevent_close();
                    hide_main_window(app_handle);
                }
            }
            RunEvent::ExitRequested { api, .. } => {
                let exit_allowed = app_handle
                    .try_state::<AppExitControl>()
                    .map(|s| s.is_exit_allowed())
                    .unwrap_or(false);

                if !exit_allowed {
                    api.prevent_exit();
                    hide_main_window(app_handle);
                }
            }
            RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    show_main_window(app_handle);
                }
            }
            _ => {}
        }
    });
}
