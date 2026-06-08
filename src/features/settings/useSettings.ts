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
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Load once on first mount — no useEffect, use useState initializer trick
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
    [] // stable — reads from ref
  );

  return { settings, updateSettings, loaded };
}

export { loadSettingsOnce };
