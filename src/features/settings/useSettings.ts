import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../../types";

const defaultSettings: Settings = {
  theme: "dark",
  drag_drop_path_mode: "absolute",
  default_shell: null,
  terminal_scrollback: 5000,
  font_size: 14,
};

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<Settings>("load_settings").then((s) => {
      setSettingsState(s);
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<Settings>) => {
      const next = { ...settings, ...partial };
      setSettingsState(next);
      await invoke("save_settings", { settings: next });
    },
    [settings]
  );

  return { settings, updateSettings, loaded };
}
