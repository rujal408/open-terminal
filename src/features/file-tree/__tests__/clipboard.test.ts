// Unit tests for the file-tree clipboard module (Cut/Copy/Paste).
// Covers the module-level state, subscriber notifications, and the paste
// behaviour for both operations including no-op and error paths.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  clipboard,
  subscribeClipboard,
  copyToClipboard,
  cutToClipboard,
  clearClipboard,
  pasteEntry,
} from "../clipboard";

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  (window.alert as ReturnType<typeof vi.fn>).mockReset();
  clearClipboard();
});

describe("clipboard — state & subscriptions", () => {
  it("copyToClipboard stores a copy entry and derives the name", () => {
    copyToClipboard("/proj/src/index.ts");
    expect(clipboard).toEqual({
      path: "/proj/src/index.ts",
      name: "index.ts",
      operation: "copy",
    });
  });

  it("cutToClipboard stores a cut entry", () => {
    cutToClipboard("/proj/a.txt");
    expect(clipboard?.operation).toBe("cut");
    expect(clipboard?.name).toBe("a.txt");
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = subscribeClipboard(listener);

    copyToClipboard("/x/y.ts");
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "/x/y.ts" })
    );

    clearClipboard();
    expect(listener).toHaveBeenLastCalledWith(null);

    unsub();
    copyToClipboard("/z.ts");
    expect(listener).toHaveBeenCalledTimes(2); // no further calls
  });
});

describe("clipboard — pasteEntry", () => {
  it("does nothing when the clipboard is empty", async () => {
    await pasteEntry("/dest");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("moves (rename_entry) and clears on a cut paste", async () => {
    cutToClipboard("/proj/a.txt");
    await pasteEntry("/proj/sub");
    expect(invoke).toHaveBeenCalledWith("rename_entry", {
      oldPath: "/proj/a.txt",
      newPath: "/proj/sub/a.txt",
    });
    expect(clipboard).toBeNull(); // cut consumed
  });

  it("copies (copy_entry) and keeps the clipboard on a copy paste", async () => {
    copyToClipboard("/proj/a.txt");
    await pasteEntry("/proj/sub");
    expect(invoke).toHaveBeenCalledWith("copy_entry", {
      src: "/proj/a.txt",
      dst: "/proj/sub/a.txt",
    });
    expect(clipboard).not.toBeNull(); // copy persists for repeated pastes
  });

  it("is a no-op when pasting into the same location", async () => {
    copyToClipboard("/proj/a.txt");
    await pasteEntry("/proj"); // dst would equal src
    expect(invoke).not.toHaveBeenCalled();
  });

  it("alerts when the IPC call fails", async () => {
    invoke.mockRejectedValue(new Error("boom"));
    copyToClipboard("/proj/a.txt");
    await pasteEntry("/proj/sub");
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("Paste failed")
    );
  });
});
