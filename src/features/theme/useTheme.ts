import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings, Theme } from "../../types";
import { darkTheme, lightTheme } from "./themes";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(darkTheme);

  useEffect(() => {
    invoke<Settings>("load_settings").then((settings) => {
      if (settings.theme === "light") {
        setThemeState(lightTheme);
      } else if (settings.theme === "dark") {
        setThemeState(darkTheme);
      } else {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setThemeState(prefersDark ? darkTheme : lightTheme);
      }
    });
  }, []);

  const setTheme = (name: string) => {
    const next = name === "light" ? lightTheme : darkTheme;
    setThemeState(next);
    invoke("save_settings", {
      settings: {
        theme: name,
        drag_drop_path_mode: "absolute",
        default_shell: null,
        terminal_scrollback: 5000,
        font_size: 14,
      },
    });
  };

  return { theme, setTheme };
}
