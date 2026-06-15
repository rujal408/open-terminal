//! Filesystem operations exposed as Tauri IPC commands.
//!
//! These are the building blocks for the file tree panel and the built-in
//! code editor in the frontend.

use serde::Serialize;
use std::fs;
use std::path::Path;

/// A single file or directory entry returned to the frontend for the file tree.
/// Serialized to JSON automatically by Tauri's IPC layer.
#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// Files starting with '.' are considered hidden (Unix convention).
    /// The frontend uses this to toggle hidden-file visibility.
    pub is_hidden: bool,
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<DirEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_hidden = name.starts_with('.');
            Some(DirEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir: entry.file_type().ok()?.is_dir(),
                is_hidden,
            })
        })
        .collect();

    // Sort: directories first (`b.is_dir.cmp(&a.is_dir)` puts true before false),
    // then alphabetically by name (case-insensitive) within each group.
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("Already exists: {}", path));
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("Already exists: {}", path));
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

/// Recursively copies a file or directory to a new location.
/// Used by the file tree's Copy + Paste workflow.
#[tauri::command]
pub fn copy_entry(src: String, dst: String) -> Result<(), String> {
    let src_path = Path::new(&src);
    let dst_path = Path::new(&dst);
    if dst_path.exists() {
        return Err(format!("Already exists: {}", dst));
    }
    if src_path.is_dir() {
        copy_dir_recursive(src_path, dst_path)
    } else {
        fs::copy(src_path, dst_path)
            .map(|_| ())
            .map_err(|e| format!("Failed to copy: {}", e))
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_child = entry.path();
        let dst_child = dst.join(entry.file_name());
        if src_child.is_dir() {
            copy_dir_recursive(&src_child, &dst_child)?;
        } else {
            fs::copy(&src_child, &dst_child).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Moves a file or directory to the OS trash/recycle bin instead of permanently
/// deleting it. This gives users a safety net to recover accidentally deleted files.
/// Falls back to recursive removal if the trash crate fails (e.g. on some Linux
/// desktops where trash support is limited).
#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    match trash::delete(p) {
        Ok(_) => Ok(()),
        Err(_) => {
            // Fallback: permanently remove if trashing fails
            if p.is_dir() {
                fs::remove_dir_all(p)
                    .map_err(|e| format!("Failed to delete {}: {}", path, e))
            } else {
                fs::remove_file(p)
                    .map_err(|e| format!("Failed to delete {}: {}", path, e))
            }
        }
    }
}
