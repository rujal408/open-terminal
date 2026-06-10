import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Theme } from "../../types";
import { darkTheme, lightTheme } from "./themes";
import { loadSettingsOnce } from "../settings/useSettings";

const BUILTIN_THEMES: Theme[] = [darkTheme, lightTheme];

/**
 * Resolves a theme name to a Theme object. Resolution order:
 *   1. Check built-in names ("dark" / "light") -- case-insensitive first char.
 *   2. Search the user's custom themes loaded from the Rust backend.
 *   3. If nothing matches (e.g. the saved name was deleted), fall back to
 *      the OS color-scheme preference via matchMedia.
 */
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

  // Ref always points at the latest custom themes list. setTheme (below)
  // has an empty dep array so it keeps a stable identity and never
  // re-renders consumers. Without the ref, setTheme would close over a
  // stale `customThemes` value and fail to find newly loaded themes.
  const customRef = useRef(customThemes);
  customRef.current = customThemes;

  // Load saved settings and user-created custom themes from the Rust
  // backend in parallel on first render. We use the useState initializer
  // trick (runs synchronously during initial render, once) instead of
  // useEffect to kick off the load before the first paint.
  const [_initialized] = useState(() => {
    Promise.all([
      loadSettingsOnce(),
      invoke<Theme[]>("load_custom_themes").catch(() => []),
    ]).then(([settings, custom]) => {
      customRef.current = custom;
      setCustomThemes(custom);
      // Resolve the saved theme name (e.g. "dark" or a custom name)
      // against the loaded custom themes to get the full Theme object.
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
