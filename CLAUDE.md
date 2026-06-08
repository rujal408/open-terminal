# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tauri 2 desktop application with a React 19 + TypeScript frontend and Rust backend. Package manager is pnpm.

## Commands

```bash
# Development
pnpm dev              # Vite dev server on http://localhost:1420
pnpm tauri dev        # Full desktop app with hot reload

# Build
pnpm build            # TypeScript compile + Vite bundle
pnpm tauri build      # Bundle into native desktop application

# Type checking (no separate test or lint commands configured)
npx tsc --noEmit
```

## Architecture

**Frontend (`src/`)** — React + TypeScript, bundled by Vite. Entry: `index.html` → `src/main.tsx` → `src/App.tsx`.

**Backend (`src-tauri/`)** — Rust. Entry: `src-tauri/src/main.rs` calls into `lib.rs` which configures the Tauri runtime, registers plugins, and exposes commands.

**IPC** — Frontend calls Rust commands via `invoke("command_name", { args })` from `@tauri-apps/api`. Rust handlers use `#[tauri::command]` and are registered with `generate_handler![]`.

**Tauri config** — `src-tauri/tauri.conf.json` defines app identity (`com.rujal.open-terminal`), window defaults (800×600), build commands, and bundle targets.

## Key Conventions

- Rust commands: define with `#[tauri::command]` in `src-tauri/src/lib.rs`, register in the `generate_handler![]` macro call
- Plugins: initialize via `tauri::Builder::default().plugin(...)` chain in `lib.rs`
- Frontend uses ESM (`"type": "module"` in package.json), strict TypeScript, functional React components with hooks
- Vite ignores `src-tauri/` to avoid unnecessary rebuilds; HMR runs on port 1421

## Skills

- **react-design** (`.claude/skills/react-design/SKILL.md`) — audit and refactor React components for proper separation, re-render control, and subscription-based context using `useSyncExternalStore`. Trigger: `/react-design`
