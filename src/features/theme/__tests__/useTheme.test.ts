// Unit tests for useTheme — resolves a theme name to a Theme object (built-in,
// custom, or OS-preference fallback) and manages custom themes loaded from the
// backend. Themes are compared by reference against the real built-ins.

import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "../../../types";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useTheme } from "../useTheme";
import { darkTheme, lightTheme } from "../themes";

const customTheme = { ...lightTheme, name: "My Custom" } as Theme;

beforeEach(() => {
  invoke.mockReset().mockImplementation((cmd: string) => {
    if (cmd === "load_settings")
      return Promise.resolve({
        theme: "light",
        drag_drop_path_mode: "absolute",
        default_shell: null,
        terminal_scrollback: 5000,
        font_size: 14,
      });
    if (cmd === "load_custom_themes") return Promise.resolve([customTheme]);
    return Promise.resolve(undefined);
  });
});

describe("useTheme — resolution", () => {
  it("resolves the saved theme name from settings on first render", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe(lightTheme));
  });

  it("setTheme resolves built-in names", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe(lightTheme));

    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe(darkTheme);

    act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe(lightTheme);
  });

  it("setTheme resolves a custom theme by name", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.customThemes).toHaveLength(1));

    act(() => result.current.setTheme("My Custom"));
    expect(result.current.theme).toBe(customTheme);
  });

  it("setTheme falls back to the OS preference for an unknown name", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.customThemes).toHaveLength(1));

    // matchMedia is stubbed to matches:false → not dark → light fallback.
    act(() => result.current.setTheme("does-not-exist"));
    expect(result.current.theme).toBe(lightTheme);
  });

  it("setThemeObject sets a theme object directly", async () => {
    const { result } = renderHook(() => useTheme());
    const adhoc = { ...darkTheme, name: "Adhoc" } as Theme;
    act(() => result.current.setThemeObject(adhoc));
    expect(result.current.theme).toBe(adhoc);
  });
});

describe("useTheme — custom themes", () => {
  it("exposes built-ins plus custom themes in allThemes", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.customThemes).toHaveLength(1));
    expect(result.current.allThemes).toEqual([
      darkTheme,
      lightTheme,
      customTheme,
    ]);
  });

  it("reloadCustomThemes re-fetches from the backend", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.customThemes).toHaveLength(1));

    const another = { ...darkTheme, name: "Another" } as Theme;
    invoke.mockImplementation((cmd: string) =>
      cmd === "load_custom_themes"
        ? Promise.resolve([customTheme, another])
        : Promise.resolve(undefined)
    );

    await act(async () => {
      await result.current.reloadCustomThemes();
    });
    expect(result.current.customThemes).toHaveLength(2);
  });
});
