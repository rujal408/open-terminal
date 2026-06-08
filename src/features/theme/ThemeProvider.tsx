import { createContext, useContext, useEffect, useMemo } from "react";
import type { Theme } from "../../types";
import { useTheme } from "./useTheme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (name: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();

  // Side effect: sync CSS custom properties to document root
  useEffect(() => {
    const root = document.documentElement;
    const c = theme.colors;
    root.style.setProperty("--bg", c.background);
    root.style.setProperty("--sidebar", c.sidebar);
    root.style.setProperty("--tab-bar", c.tabBar);
    root.style.setProperty("--tab-active", c.tabActive);
    root.style.setProperty("--tab-inactive", c.tabInactive);
    root.style.setProperty("--border", c.border);
    root.style.setProperty("--text", c.text);
    root.style.setProperty("--text-muted", c.textMuted);
    root.style.setProperty("--accent", c.accent);
    root.style.setProperty("--editor-bg", c.editorBg);
    root.style.setProperty("--editor-fg", c.editorFg);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
