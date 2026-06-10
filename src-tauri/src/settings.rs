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
            default_shell: None,
            terminal_scrollback: 5000,
            font_size: 14,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub last_opened: u64,
}

fn config_dir() -> PathBuf {
    let base = dirs::home_dir().expect("could not resolve home directory");
    base.join(".open-terminal")
}

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

#[tauri::command]
pub fn add_recent_project(project_path: String, name: String) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("recent-projects.json");
    let mut projects = load_recent_projects();

    projects.retain(|p| p.path != project_path);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    projects.insert(
        0,
        RecentProject {
            path: project_path,
            name,
            last_opened: timestamp,
        },
    );

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

/// A custom theme is stored as raw JSON (serde_json::Value) so the Rust
/// side doesn't need to mirror every frontend color field.
#[tauri::command]
pub fn load_custom_themes() -> Vec<serde_json::Value> {
    let path = config_dir().join("custom-themes.json");
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub fn save_custom_theme(theme: serde_json::Value) -> Result<(), String> {
    let name = theme
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("theme must have a name")?
        .to_string();

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
