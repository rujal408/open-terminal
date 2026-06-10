//! Filesystem watcher — monitors a workspace directory for changes and notifies
//! the frontend so the file tree can update in real time without polling.
//!
//! Uses `notify` (via `notify_debouncer_mini`) which hooks into OS-level file
//! system events (inotify on Linux, FSEvents on macOS, ReadDirectoryChanges on
//! Windows).

use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Event payload sent to the frontend when a file changes.
/// The frontend uses `parent` to know which directory to re-list.
#[derive(Debug, Clone, Serialize)]
pub struct FsChangeEvent {
    pub path: String,
    pub parent: String,
}

type WatcherHandle = notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>;

/// Holds one watcher per workspace. Keyed by `workspace_id` so that when the
/// user switches projects, we can tear down the old watcher and start a new one
/// without leaking OS resources.
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

    // If this workspace already has a watcher (e.g. from a previous project),
    // remove it. Dropping the debouncer stops the OS-level watch.
    watchers.remove(&workspace_id);

    let app_handle = app.clone();
    let watch_path = PathBuf::from(&path);

    // Debouncing batches rapid filesystem events (e.g. a `git checkout` touching
    // hundreds of files) into a single callback after 300ms of quiet. Without
    // this, the frontend would get flooded with hundreds of individual events
    // and re-list directories repeatedly for no benefit.
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = events {
                // Deduplication: if multiple files in the same directory changed,
                // we only need to tell the frontend once to re-list that directory.
                // `seen_parents` tracks which parent directories we've already
                // emitted an event for in this batch.
                let mut seen_parents = std::collections::HashSet::new();
                for event in events {
                    if event.kind == DebouncedEventKind::Any {
                        let changed_path = event.path.to_string_lossy().to_string();
                        let parent = event
                            .path
                            .parent()
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_default();

                        // `insert` returns true only if the value was NOT already
                        // in the set, so we skip duplicate parents.
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

    // Watch the entire directory tree recursively so we catch changes in
    // subdirectories too (e.g. creating a new file in src/components/).
    debouncer
        .watcher()
        .watch(&watch_path, notify::RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", path, e))?;

    watchers.insert(workspace_id, debouncer);
    Ok(())
}

/// Stop watching a workspace's directory. Called when the user closes a project
/// or switches to a different one. Dropping the debouncer releases the OS watch.
#[tauri::command]
pub fn unwatch_directory(app: AppHandle, workspace_id: String) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut watchers = state.watchers.lock();
    watchers.remove(&workspace_id);
    Ok(())
}
