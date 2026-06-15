// Clipboard for file tree Cut / Copy / Paste operations.
// The actual state lives as a module-level variable (for context menu access),
// but we also notify React via a subscriber so the UI can show visual feedback
// (e.g. fading cut items).

import { invoke } from "@tauri-apps/api/core";

export interface FileClipboard {
  path: string;
  name: string;
  operation: "copy" | "cut";
}

export let clipboard: FileClipboard | null = null;

// Simple subscriber so React components can re-render when clipboard changes
type Listener = (cb: FileClipboard | null) => void;
const listeners = new Set<Listener>();

export function subscribeClipboard(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() {
  listeners.forEach((fn) => fn(clipboard));
}

export function copyToClipboard(path: string) {
  const name = path.split("/").pop() || "";
  clipboard = { path, name, operation: "copy" };
  notify();
}

export function cutToClipboard(path: string) {
  const name = path.split("/").pop() || "";
  clipboard = { path, name, operation: "cut" };
  notify();
}

export function clearClipboard() {
  clipboard = null;
  notify();
}

/** Paste the clipboard content into `targetDir`. */
export async function pasteEntry(targetDir: string) {
  if (!clipboard) return;
  const { path: srcPath, name, operation } = clipboard;
  const dstPath = `${targetDir}/${name}`;

  if (srcPath === dstPath) return;

  try {
    if (operation === "cut") {
      await invoke("rename_entry", { oldPath: srcPath, newPath: dstPath });
      clipboard = null;
      notify();
    } else {
      await invoke("copy_entry", { src: srcPath, dst: dstPath });
    }
  } catch (e) {
    alert(`Paste failed: ${e}`);
  }
}
