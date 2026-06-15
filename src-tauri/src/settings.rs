//! Persistent settings and recent project history.
//!
//! All config files are stored in `~/.open-terminal/`:
//!   - `settings.json`        — user preferences (theme, font size, shell, etc.)
//!   - `recent-projects.json` — MRU list of opened projects (max 20)
//!   - `custom-themes.json`   — user-created color themes

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
    pub drag_drop_path_mode: String,
    pub default_shell: Option<String>,
    pub terminal_scrollback: u32,
    pub font_size: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            drag_drop_path_mode: "absolute".to_string(),
            default_shell: None, // None means "use $SHELL or /bin/bash"
            terminal_scrollback: 5000,
            font_size: 14,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    /// Unix timestamp (seconds since epoch) of when this project was last opened
    pub last_opened: u64,
}

/// Returns the path to the config directory (~/.open-terminal/).
fn config_dir() -> PathBuf {
    let base = dirs::home_dir().expect("could not resolve home directory");
    base.join(".open-terminal")
}

/// Returns the config directory path, creating it if it doesn't exist.
/// Called before any write operation to guarantee the directory is present.
fn ensure_config_dir() -> PathBuf {
    let dir = config_dir();
    fs::create_dir_all(&dir).ok();
    dir
}

#[tauri::command]
pub fn load_settings() -> Settings {
    let path = config_dir().join("settings.json");
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_recent_projects() -> Vec<RecentProject> {
    let path = config_dir().join("recent-projects.json");
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Add a project to the recent projects list (MRU — most recently used).
///
/// Flow:
///   1. Remove any existing entry for this path (dedup — prevents duplicates)
///   2. Insert the project at position 0 (top of the list = most recent)
///   3. Truncate to 20 entries so the list doesn't grow unbounded
///   4. Write the updated list to disk
#[tauri::command]
pub fn add_recent_project(project_path: String, name: String) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("recent-projects.json");
    let mut projects = load_recent_projects();

    // Dedup: remove existing entry so we don't get the same project twice
    projects.retain(|p| p.path != project_path);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Insert at the front so the most recently opened project comes first
    projects.insert(
        0,
        RecentProject {
            path: project_path,
            name,
            last_opened: timestamp,
        },
    );

    // Cap the list at 20 projects to keep the file small and the UI clean
    projects.truncate(20);

    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_recent_project(project_path: String) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("recent-projects.json");
    let mut projects = load_recent_projects();
    projects.retain(|p| p.path != project_path);
    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

// ── Custom themes ──────────────────────────────────────────────────────
// Custom themes are stored as raw JSON (`serde_json::Value`) rather than a
// typed Rust struct. This is intentional — the frontend defines dozens of
// color fields (editor background, sidebar tint, terminal colors, etc.) and
// we don't want the Rust side to break every time a new color field is added.
// Rust just acts as a pass-through storage layer here.

#[tauri::command]
pub fn load_custom_themes() -> Vec<serde_json::Value> {
    let path = config_dir().join("custom-themes.json");
    let themes: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    // Filter out any themes that share a name with built-in themes
    themes
        .into_iter()
        .filter(|t| {
            let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let lower = name.to_lowercase();
            lower != "dark" && lower != "light"
        })
        .collect()
}

#[tauri::command]
pub fn save_custom_theme(theme: serde_json::Value) -> Result<(), String> {
    let name = theme
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("theme must have a name")?
        .to_string();

    // Reject built-in theme names
    let lower = name.to_lowercase();
    if lower == "dark" || lower == "light" {
        return Err("Cannot overwrite built-in theme".into());
    }

    let dir = ensure_config_dir();
    let path = dir.join("custom-themes.json");
    let mut themes: Vec<serde_json::Value> = load_custom_themes();

    // Replace existing theme with same name, or append
    if let Some(pos) = themes.iter().position(|t| {
        t.get("name").and_then(|v| v.as_str()) == Some(&name)
    }) {
        themes[pos] = theme;
    } else {
        themes.push(theme);
    }

    let json = serde_json::to_string_pretty(&themes).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_custom_theme(name: String) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("custom-themes.json");
    let mut themes: Vec<serde_json::Value> = load_custom_themes();
    themes.retain(|t| t.get("name").and_then(|v| v.as_str()) != Some(&name));
    let json = serde_json::to_string_pretty(&themes).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}
