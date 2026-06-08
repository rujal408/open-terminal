use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct FsChangeEvent {
    pub path: String,
    pub parent: String,
}

type WatcherHandle = notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>;

pub struct WatcherState {
    watchers: Mutex<HashMap<String, WatcherHandle>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn watch_directory(
    app: AppHandle,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut watchers = state.watchers.lock();

    // Remove existing watcher for this workspace if any
    watchers.remove(&workspace_id);

    let app_handle = app.clone();
    let watch_path = PathBuf::from(&path);

    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = events {
                let mut seen_parents = std::collections::HashSet::new();
                for event in events {
                    if event.kind == DebouncedEventKind::Any {
                        let changed_path = event.path.to_string_lossy().to_string();
                        let parent = event
                            .path
                            .parent()
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_default();

                        // Deduplicate by parent — no need to re-list same dir multiple times
                        if seen_parents.insert(parent.clone()) {
                            let _ = app_handle.emit(
                                "fs-changed",
                                FsChangeEvent {
                                    path: changed_path,
                                    parent,
                                },
                            );
                        }
                    }
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    debouncer
        .watcher()
        .watch(&watch_path, notify::RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", path, e))?;

    watchers.insert(workspace_id, debouncer);
    Ok(())
}

#[tauri::command]
pub fn unwatch_directory(app: AppHandle, workspace_id: String) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut watchers = state.watchers.lock();
    watchers.remove(&workspace_id);
    Ok(())
}
