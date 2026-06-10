// Each `mod` declaration tells Rust to include the corresponding file
// (e.g. `mod filesystem` loads `filesystem.rs`). This makes the module's
// public items available under its namespace (e.g. `filesystem::list_directory`).
mod file_watcher; // Watches the workspace for file changes and notifies the frontend
mod filesystem;   // CRUD operations on files and directories
mod git_commands;  // Git operations (status, stage, commit, branch, etc.)
mod pty_manager;   // Pseudo-terminal lifecycle: spawn, write, resize, kill
mod settings;      // Persistent user settings and recent project history

// `cfg_attr(mobile, ...)` applies the attribute only on mobile targets, marking
// this function as the mobile entry point. On desktop, `main()` calls it directly.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Plugins extend Tauri with cross-platform capabilities.
        .plugin(tauri_plugin_opener::init()) // Open files/URLs with the OS default app
        .plugin(tauri_plugin_dialog::init()) // Native file-picker and message dialogs

        // `.manage()` registers shared state that any `#[tauri::command]` can
        // access via `app.state::<T>()`. This is how commands share data
        // (e.g. the map of active terminal sessions) without global variables.
        .manage(pty_manager::PtyState::new())
        .manage(file_watcher::WatcherState::new())

        // `generate_handler![]` is a macro that builds the IPC routing table.
        // Every function listed here becomes callable from the frontend via
        // `invoke("function_name", { args })`. If a command is not listed here,
        // the frontend cannot call it.
        .invoke_handler(tauri::generate_handler![
            // --- Settings: persist user preferences and recent projects ---
            settings::load_settings,
            settings::save_settings,
            settings::load_recent_projects,
            settings::add_recent_project,
            settings::remove_recent_project,
            settings::load_custom_themes,
            settings::save_custom_theme,
            settings::delete_custom_theme,

            // --- Filesystem: read, write, create, rename, delete files/dirs ---
            filesystem::list_directory,
            filesystem::read_file,
            filesystem::write_file,
            filesystem::create_file,
            filesystem::create_directory,
            filesystem::rename_entry,
            filesystem::delete_entry,

            // --- PTY: terminal emulation (spawn shells, send keystrokes) ---
            pty_manager::spawn_pty,
            pty_manager::write_pty,
            pty_manager::resize_pty,
            pty_manager::get_scrollback,
            pty_manager::kill_pty,

            // --- File watcher: live filesystem change notifications ---
            file_watcher::watch_directory,
            file_watcher::unwatch_directory,

            // --- Git: repo status, staging, branching, committing ---
            git_commands::git_status,
            git_commands::git_branches,
            git_commands::git_checkout_branch,
            git_commands::git_stage_file,
            git_commands::git_unstage_file,
            git_commands::git_discard_file,
            git_commands::git_commit,
            git_commands::git_stage_all,
            git_commands::git_unstage_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
