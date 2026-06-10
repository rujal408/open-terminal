import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Theme } from "../../types";
import { darkTheme, lightTheme } from "./themes";
import { loadSettingsOnce } from "../settings/useSettings";

const BUILTIN_THEMES: Theme[] = [darkTheme, lightTheme];

function resolveTheme(name: string, custom: Theme[]): Theme {
  if (name === "dark" || name === "Dark") return darkTheme;
  if (name === "light" || name === "Light") return lightTheme;
  const found = custom.find((t) => t.name === name);
  if (found) return found;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? darkTheme : lightTheme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(darkTheme);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  // Ref always points at latest custom themes so setTheme never has stale closure
  const customRef = useRef(customThemes);
  customRef.current = customThemes;

  // Load on mount
  const [_initialized] = useState(() => {
    Promise.all([
      loadSettingsOnce(),
      invoke<Theme[]>("load_custom_themes").catch(() => []),
    ]).then(([settings, custom]) => {
      customRef.current = custom;
      setCustomThemes(custom);
      setThemeState(resolveTheme(settings.theme, custom));
    });
    return true;
  });

  const setTheme = useCallback((name: string) => {
    setThemeState(resolveTheme(name, customRef.current));
  }, []);

  const setThemeObject = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const reloadCustomThemes = useCallback(async () => {
    const custom = await invoke<Theme[]>("load_custom_themes").catch(
      () => [] as Theme[]
    );
    customRef.current = custom;
    setCustomThemes(custom);
    return custom;
  }, []);

  const allThemes = [...BUILTIN_THEMES, ...customThemes];

  return {
    theme,
    setTheme,
    setThemeObject,
    customThemes,
    allThemes,
    reloadCustomThemes,
  };
}
