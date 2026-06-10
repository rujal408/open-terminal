//! Rust entry point for the Open Terminal desktop application.
//!
//! This file only bootstraps the Tauri runtime. All application logic lives in
//! `lib.rs` and its sub-modules so that the same code can be reused on mobile
//! targets (where `main()` is not the entry point).

// `cfg_attr` is a conditional compilation attribute. In release builds
// (`not(debug_assertions)`), it sets `windows_subsystem = "windows"` which
// tells Windows NOT to spawn a visible console window behind the GUI.
// Without this, users would see a black terminal pop up alongside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    open_terminal_lib::run()
}
