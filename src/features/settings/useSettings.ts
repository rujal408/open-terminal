import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../../types";

const defaultSettings: Settings = {
  theme: "dark",
  drag_drop_path_mode: "absolute",
  default_shell: null,
  terminal_scrollback: 5000,
  font_size: 14,
};

// Module-level singleton: the first call creates a Promise that loads
// settings from the Rust backend (disk). Subsequent calls from any
// component reuse the same Promise, so the IPC round-trip only happens
// once per app lifetime. This is also exported so useTheme.ts can read
// the saved theme name without a separate load.
let settingsLoadPromise: Promise<Settings> | null = null;

function loadSettingsOnce(): Promise<Settings> {
  if (!settingsLoadPromise) {
    settingsLoadPromise = invoke<Settings>("load_settings").catch(
      () => defaultSettings
    );
  }
  return settingsLoadPromise;
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  // Ref always points at the latest settings value. updateSettings uses
  // this ref instead of closing over `settings` directly, which lets us
  // give updateSettings an empty dependency array (stable identity) so
  // it never causes child re-renders.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // useState initializer trick: the function passed to useState runs once
  // during the initial render (synchronously). We use it to kick off the
  // async settings load. This is preferred over useEffect here because
  // useEffect runs *after* paint, causing a visible flash of default values.
  useState(() => {
    loadSettingsOnce().then((s) => {
      setSettingsState(s);
      setLoaded(true);
    });
    return true;
  });

  const updateSettings = useCallback(
    async (partial: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...partial };
      setSettingsState(next);
      await invoke("save_settings", { settings: next });
    },
    [] // stable identity -- reads current settings from ref, not closure
  );

  return { settings, updateSettings, loaded };
}

export { loadSettingsOnce };
