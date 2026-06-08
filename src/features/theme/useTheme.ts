import { useState, useCallback } from "react";
import type { Theme } from "../../types";
import { darkTheme, lightTheme } from "./themes";
import { loadSettingsOnce } from "../settings/useSettings";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(darkTheme);

  // Load theme from settings once — reuses the same promise as useSettings (no duplicate IPC)
  const [_initialized] = useState(() => {
    loadSettingsOnce().then((settings) => {
      if (settings.theme === "light") {
        setThemeState(lightTheme);
      } else if (settings.theme === "dark") {
        setThemeState(darkTheme);
      } else {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        setThemeState(prefersDark ? darkTheme : lightTheme);
      }
    });
    return true;
  });

  const setTheme = useCallback((name: string) => {
    const next = name === "light" ? lightTheme : darkTheme;
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
