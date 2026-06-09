mod file_watcher;
mod filesystem;
mod git_commands;
mod pty_manager;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty_manager::PtyState::new())
        .manage(file_watcher::WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            settings::load_settings,
            settings::save_settings,
            settings::load_recent_projects,
            settings::add_recent_project,
            settings::remove_recent_project,
            filesystem::list_directory,
            filesystem::read_file,
            filesystem::write_file,
            filesystem::create_file,
            filesystem::create_directory,
            filesystem::rename_entry,
            filesystem::delete_entry,
            pty_manager::spawn_pty,
            pty_manager::write_pty,
            pty_manager::resize_pty,
            pty_manager::get_scrollback,
            pty_manager::kill_pty,
            file_watcher::watch_directory,
            file_watcher::unwatch_directory,
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
