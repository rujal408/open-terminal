import { createContext, useContext, useEffect, useMemo } from "react";
import type { Theme } from "../../types";
import { useTheme } from "./useTheme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (name: string) => void;
  setThemeObject: (t: Theme) => void;
  customThemes: Theme[];
  allThemes: Theme[];
  reloadCustomThemes: () => Promise<Theme[]>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Wraps the app (or a subtree) to provide the current theme via React
 * Context. Any component can call `useThemeContext()` to read the active
 * theme or switch themes. ThemeProvider also owns the side effect that
 * syncs theme colors to CSS custom properties on <html>.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const {
    theme,
    setTheme,
    setThemeObject,
    customThemes,
    allThemes,
    reloadCustomThemes,
  } = useTheme();

  // Map theme colors to CSS custom properties on <html>. Tailwind classes
  // like `bg-sidebar`, `text-primary`, `border-border` etc. reference these
  // variables (defined in tailwind.config), so updating them here
  // instantly re-themes the entire UI without any component re-renders.
  // Also sets `colorScheme` so native browser elements (scrollbars, form
  // controls) adopt the correct light/dark appearance.
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
    root.style.setProperty("--git-added", c.gitAdded);
    root.style.setProperty("--git-modified", c.gitModified);
    root.style.setProperty("--git-deleted", c.gitDeleted);
    root.style.setProperty("--git-untracked", c.gitUntracked);
    root.style.setProperty("--git-conflicted", c.gitConflicted);
    root.style.colorScheme = theme.type;
  }, [theme]);

  // Wrap the context value in useMemo so that consumers only re-render
  // when one of the values actually changes. Without this, ThemeProvider
  // would create a new object on every render, causing every useContext
  // consumer to re-render even if nothing theme-related changed.
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      setThemeObject,
      customThemes,
      allThemes,
      reloadCustomThemes,
    }),
    [theme, setTheme, setThemeObject, customThemes, allThemes, reloadCustomThemes]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
