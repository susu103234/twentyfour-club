use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

const TRAY_EVENT: &str = "tray-action";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let summon_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Digit2);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed
                        && shortcut == &summon_shortcut
                    {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            build_tray(app)?;
            #[cfg(desktop)]
            {
                app.global_shortcut().register(summon_shortcut)?;
            }
            Ok(())
        })
        // Clicking the window close button hides instead of quitting so the
        // tray menu can bring the app back. "Quit" in the tray menu is the
        // only real exit path.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running 24club");
}

fn build_tray<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show 24club", true, None::<&str>)?;
    let new_hand = MenuItem::with_id(app, "new_hand", "New hand", true, None::<&str>)?;
    let rush = MenuItem::with_id(app, "rush", "Start rush", true, None::<&str>)?;
    let daily = MenuItem::with_id(app, "daily", "Daily hand", true, None::<&str>)?;
    let sep_kind = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show, &new_hand, &rush, &daily, &sep_kind, &quit],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("default icon must be bundled");

    let _tray = TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("24club")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => toggle_window(app),
            "new_hand" => emit_tray(app, "new_hand"),
            "rush" => emit_tray(app, "rush"),
            "daily" => emit_tray(app, "daily"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn toggle_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        match win.is_visible() {
            Ok(true) => {
                // Already visible — check focus; raise if obscured, hide if focused.
                let focused = win.is_focused().unwrap_or(false);
                if focused {
                    let _ = win.hide();
                } else {
                    let _ = win.set_focus();
                }
            }
            _ => {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    }
}

fn emit_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>, action: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
    let _ = app.emit(TRAY_EVENT, action);
}
