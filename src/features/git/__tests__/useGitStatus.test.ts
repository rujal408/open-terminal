// Unit tests for useGitStatus — polls git status and derives the lookup maps
// the file tree uses to color files/folders, plus the stage/commit/etc. action
// helpers. The key derivation logic under test:
//   - statusMap: exact per-file status
//   - dirtyDirs: dominant status bubbled up to ancestor folders, where higher
//     priority wins and "ignored" is NOT propagated (so node_modules doesn't
//     grey out its parent project folder).

import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusInfo } from "../../../types";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useGitStatus } from "../useGitStatus";

const EMPTY: GitStatusInfo = {
  is_repo: true,
  branch: "main",
  is_dirty: true,
  ahead: 0,
  behind: 0,
  staged: [],
  modified: [],
  untracked: [],
  ignored: [],
  conflicted: [],
};

let currentStatus: GitStatusInfo;

beforeEach(() => {
  currentStatus = { ...EMPTY };
  invoke.mockReset().mockImplementation((cmd: string) => {
    if (cmd === "git_status") return Promise.resolve(currentStatus);
    if (cmd === "git_branches") return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
});

async function renderReady(status: Partial<GitStatusInfo>) {
  currentStatus = { ...EMPTY, ...status };
  const view = renderHook(() => useGitStatus("/p"));
  await waitFor(() => expect(view.result.current.status.is_repo).toBe(true));
  return view;
}

describe("useGitStatus — polling", () => {
  it("fetches git status for the project on mount", async () => {
    await renderReady({ branch: "develop" });
    expect(invoke).toHaveBeenCalledWith("git_status", { projectPath: "/p" });
  });

  it("does not poll when projectPath is null", () => {
    renderHook(() => useGitStatus(null));
    expect(invoke).not.toHaveBeenCalledWith("git_status", expect.anything());
  });

  it("falls back to an empty (non-repo) status when the call rejects", async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === "git_status" ? Promise.reject(new Error("not a repo")) : Promise.resolve(undefined)
    );
    const { result } = renderHook(() => useGitStatus("/p"));
    await waitFor(() => expect(result.current.status.is_repo).toBe(false));
    expect(result.current.statusMap.size).toBe(0);
  });
});

describe("useGitStatus — statusMap", () => {
  it("maps each changed file path to its status", async () => {
    const { result } = await renderReady({
      staged: [{ path: "/p/a.ts", status: "staged" }],
      modified: [{ path: "/p/b.ts", status: "modified" }],
      untracked: [{ path: "/p/c.ts", status: "untracked" }],
    });
    expect(result.current.statusMap.get("/p/a.ts")).toBe("staged");
    expect(result.current.statusMap.get("/p/b.ts")).toBe("modified");
    expect(result.current.statusMap.get("/p/c.ts")).toBe("untracked");
  });
});

describe("useGitStatus — dirtyDirs (ancestor roll-up)", () => {
  it("marks every ancestor directory of a changed file", async () => {
    const { result } = await renderReady({
      modified: [{ path: "/p/src/index.ts", status: "modified" }],
    });
    expect(result.current.dirtyDirs.get("/p/src")).toBe("modified");
    expect(result.current.dirtyDirs.get("/p")).toBe("modified");
  });

  it("lets a higher-priority status win over a lower one in the same folder", async () => {
    const { result } = await renderReady({
      modified: [{ path: "/p/a/m.ts", status: "modified" }],
      untracked: [{ path: "/p/a/u.ts", status: "untracked" }],
    });
    expect(result.current.dirtyDirs.get("/p/a")).toBe("modified");
  });

  it("lets conflicted (highest priority) override other statuses", async () => {
    const { result } = await renderReady({
      modified: [{ path: "/p/a/m.ts", status: "modified" }],
      conflicted: [{ path: "/p/a/c.ts", status: "conflicted" }],
    });
    expect(result.current.dirtyDirs.get("/p/a")).toBe("conflicted");
  });

  it("does NOT propagate 'ignored' to ancestor folders (node_modules fix)", async () => {
    const { result } = await renderReady({
      ignored: [{ path: "/p/app/node_modules", status: "ignored" }],
      modified: [{ path: "/p/app/src/x.ts", status: "modified" }],
    });
    // node_modules itself is still flagged ignored…
    expect(result.current.statusMap.get("/p/app/node_modules")).toBe("ignored");
    // …but its parent project folder is colored by the real change, not ignored.
    expect(result.current.dirtyDirs.get("/p/app")).toBe("modified");
    expect(result.current.dirtyDirs.has("/p/app/node_modules")).toBe(false);
  });
});

describe("useGitStatus — actions", () => {
  it("stageFile stages then refreshes", async () => {
    const { result } = await renderReady({});
    await act(async () => {
      await result.current.stageFile("/p/a.ts");
    });
    expect(invoke).toHaveBeenCalledWith("git_stage_file", {
      projectPath: "/p",
      filePath: "/p/a.ts",
    });
  });

  it("commit sends the message", async () => {
    const { result } = await renderReady({});
    await act(async () => {
      await result.current.commit("my message");
    });
    expect(invoke).toHaveBeenCalledWith("git_commit", {
      projectPath: "/p",
      message: "my message",
    });
  });

  it("checkoutBranch checks out and refreshes branches", async () => {
    const { result } = await renderReady({});
    await act(async () => {
      await result.current.checkoutBranch("feature/x");
    });
    expect(invoke).toHaveBeenCalledWith("git_checkout_branch", {
      projectPath: "/p",
      branchName: "feature/x",
    });
    expect(invoke).toHaveBeenCalledWith("git_branches", { projectPath: "/p" });
  });
});
