// Isolated test for the load-failure path: when load_settings rejects,
// useSettings falls back to its built-in defaults. Kept in its own file so the
// module-level load promise is fresh (it's cached after the first call).

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useSettings } from "../useSettings";

beforeEach(() => {
  invoke.mockReset().mockImplementation((cmd: string) =>
    cmd === "load_settings"
      ? Promise.reject(new Error("disk error"))
      : Promise.resolve(undefined)
  );
});

describe("useSettings — load failure", () => {
  it("falls back to default settings when the load rejects", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings).toEqual({
      theme: "dark",
      drag_drop_path_mode: "absolute",
      default_shell: null,
      terminal_scrollback: 5000,
      font_size: 14,
    });
  });
});
