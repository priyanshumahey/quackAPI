mod commands;
pub mod core;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
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
        .manage(commands::HttpClientState::new())
        .manage(commands::WebSocketState::new())
        .manage(commands::HistoryState::new())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|_pass| todo!()).build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::read_directory,
            commands::expand_directory,
            commands::check_folder_exists,
            commands::get_path_info,
            commands::check_quack_initialized,
            commands::init_quack_workspace,
            commands::load_quack_workspace,
            commands::list_environments,
            commands::toggle_env_file,
            commands::toggle_env_variable,
            commands::add_env_variable,
            commands::update_env_variable,
            commands::delete_env_variable,
            commands::create_env_file,
            commands::rename_env_file,
            commands::delete_env_file,
            commands::list_collections,
            commands::create_collection_folder,
            commands::create_collection,
            commands::rename_collection_folder,
            commands::rename_collection,
            commands::delete_collection_item,
            commands::add_request_to_collection,
            commands::move_collection_item,
            commands::move_request_to_collection,
            commands::rename_request,
            commands::delete_request,
            commands::update_collection_description,
            commands::get_request_details,
            commands::update_request,
            commands::read_folder_readme,
            commands::write_folder_readme,
            commands::send_http_request,
            commands::cancel_http_request,
            commands::ws_connect,
            commands::ws_send_message,
            commands::ws_disconnect,
            commands::install_cli,
            commands::uninstall_cli,
            commands::check_cli_installed,
            commands::history_list,
            commands::history_get,
            commands::history_read_blob,
            commands::history_delete,
            commands::history_clear,
            commands::history_redaction_defaults,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{
                    MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
                };

                let app_menu = SubmenuBuilder::new(app, "Quack API")
                    .about(None)
                    .separator()
                    .item(
                        &MenuItemBuilder::with_id("install_cli", "Install Command Line Tool...")
                            .build(app)?,
                    )
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;

                let open_folder =
                    MenuItemBuilder::with_id("open_folder", "Open Folder...")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?;

                let close_folder =
                    MenuItemBuilder::with_id("close_folder", "Close Folder")
                        .accelerator("CmdOrCtrl+W")
                        .build(app)?;

                let close_window =
                    PredefinedMenuItem::close_window(app, Some("Close Window"))?;

                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&open_folder)
                    .item(&close_folder)
                    .separator()
                    .item(&close_window)
                    .build()?;

                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                let view_menu = SubmenuBuilder::new(app, "View")
                    .fullscreen()
                    .build()?;

                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .items(&[
                        &app_menu,
                        &file_menu,
                        &edit_menu,
                        &view_menu,
                        &window_menu,
                    ])
                    .build()?;

                app.set_menu(menu)?;

                app.on_menu_event(move |app_handle, event| {
                    match event.id().as_ref() {
                        "open_folder" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.emit("menu-open-folder", ());
                            }
                        }
                        "close_folder" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.emit("menu-close-folder", ());
                            }
                        }
                        "install_cli" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.emit("menu-install-cli", ());
                            }
                        }
                        _ => {}
                    }
                });
            }

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
