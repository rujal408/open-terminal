// Unit tests for useSettings — loads persisted settings once (module-level
// singleton) and persists updates. The load-failure fallback is covered in a
// sibling file because the load promise is cached per module instance.

import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../../types";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useSettings } from "../useSettings";

const SAVED: Settings = {
  theme: "light",
  drag_drop_path_mode: "relative",
  default_shell: "/bin/zsh",
  terminal_scrollback: 8000,
  font_size: 16,
};

beforeEach(() => {
  invoke.mockReset().mockImplementation((cmd: string) => {
    if (cmd === "load_settings") return Promise.resolve(SAVED);
    return Promise.resolve(undefined);
  });
});

describe("useSettings", () => {
  it("loads persisted settings on first render and flips `loaded`", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings).toEqual(SAVED);
  });

  it("updateSettings merges the partial, updates state and persists", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.updateSettings({ font_size: 22 });
    });

    expect(result.current.settings.font_size).toBe(22);
    // Other fields are preserved in the merge.
    expect(result.current.settings.theme).toBe("light");
    expect(invoke).toHaveBeenCalledWith("save_settings", {
      settings: expect.objectContaining({ font_size: 22, theme: "light" }),
    });
  });
});
