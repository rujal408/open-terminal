import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitStatusInfo, GitBranchEntry } from "../../types";

/** How often (ms) we poll the Rust backend for updated git status. */
const POLL_INTERVAL = 2000;

const EMPTY_STATUS: GitStatusInfo = {
  is_repo: false,
  branch: "",
  is_dirty: false,
  ahead: 0,
  behind: 0,
  staged: [],
  modified: [],
  untracked: [],
  conflicted: [],
};

/**
 * Polls git status for `projectPath` every 2 seconds and exposes the
 * result plus action helpers (stage, unstage, discard, commit, etc.).
 * Pass `null` to disable polling (e.g. before the workspace is ready).
 */
export function useGitStatus(projectPath: string | null) {
  const [status, setStatus] = useState<GitStatusInfo>(EMPTY_STATUS);
  const [branches, setBranches] = useState<GitBranchEntry[]>([]);

  // Guards against calling setState after the component unmounts.
  // The polling interval may fire between unmount and clearInterval,
  // and the invoke Promise may resolve after unmount.
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    try {
      const s = await invoke<GitStatusInfo>("git_status", {
        projectPath,
      });
      if (mountedRef.current) setStatus(s);
    } catch {
      if (mountedRef.current) setStatus(EMPTY_STATUS);
    }
  }, [projectPath]);

  const refreshBranches = useCallback(async () => {
    if (!projectPath) return;
    try {
      const b = await invoke<GitBranchEntry[]>("git_branches", {
        projectPath,
      });
      if (mountedRef.current) setBranches(b);
    } catch {
      if (mountedRef.current) setBranches([]);
    }
  }, [projectPath]);

  // Start polling: fetch once immediately, then every POLL_INTERVAL ms.
  // When `refresh` changes identity (because projectPath changed), the
  // cleanup runs, sets mountedRef to false (preventing stale setStatus
  // calls from the old path), and clears the old interval.
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  const stageFile = useCallback(
    async (filePath: string) => {
      if (!projectPath) return;
      await invoke("git_stage_file", { projectPath, filePath });
      refresh();
    },
    [projectPath, refresh]
  );

  const unstageFile = useCallback(
    async (filePath: string) => {
      if (!projectPath) return;
      await invoke("git_unstage_file", { projectPath, filePath });
      refresh();
    },
    [projectPath, refresh]
  );

  const discardFile = useCallback(
    async (filePath: string) => {
      if (!projectPath) return;
      await invoke("git_discard_file", { projectPath, filePath });
      refresh();
    },
    [projectPath, refresh]
  );

  const stageAll = useCallback(async () => {
    if (!projectPath) return;
    await invoke("git_stage_all", { projectPath });
    refresh();
  }, [projectPath, refresh]);

  const unstageAll = useCallback(async () => {
    if (!projectPath) return;
    await invoke("git_unstage_all", { projectPath });
    refresh();
  }, [projectPath, refresh]);

  const commit = useCallback(
    async (message: string) => {
      if (!projectPath) return;
      await invoke("git_commit", { projectPath, message });
      refresh();
    },
    [projectPath, refresh]
  );

  const checkoutBranch = useCallback(
    async (branchName: string) => {
      if (!projectPath) return;
      await invoke("git_checkout_branch", { projectPath, branchName });
      refresh();
      refreshBranches();
    },
    [projectPath, refresh, refreshBranches]
  );

  // Derive two lookup structures from the flat status arrays for FileTree:
  //
  //   statusMap: Map<absoluteFilePath, statusString>
  //     Used by FileTreeNode to color individual file names (e.g. green for
  //     staged, yellow for modified).
  //
  //   dirtyDirs: Set<absoluteDirPath>
  //     For every changed file, we walk up the path and mark each ancestor
  //     directory as "dirty". FileTree uses this to show a dot/indicator on
  //     parent folders that contain changes somewhere inside them. The inner
  //     loop short-circuits (`if (dirs.has(parent)) break`) because if a
  //     directory is already marked, all its ancestors must be too.
  //
  // Both are memoized on `status` so that when the poll returns identical
  // data, FileTree (which is memo'd) gets the same object references and
  // skips re-rendering.
  const { statusMap, dirtyDirs } = useMemo(() => {
    const map = new Map<string, string>();
    const dirs = new Set<string>();
    if (status.is_repo) {
      const addEntry = (path: string, st: string) => {
        map.set(path, st);
        // Mark every ancestor directory as dirty
        let parent = path;
        while (true) {
          const slash = parent.lastIndexOf("/");
          if (slash <= 0) break;
          parent = parent.substring(0, slash);
          if (dirs.has(parent)) break; // ancestors already marked
          dirs.add(parent);
        }
      };
      for (const f of status.staged) addEntry(f.path, "staged");
      for (const f of status.modified) addEntry(f.path, f.status);
      for (const f of status.untracked) addEntry(f.path, "untracked");
      for (const f of status.conflicted) addEntry(f.path, "conflicted");
    }
    return { statusMap: map, dirtyDirs: dirs };
  }, [status]);

  return {
    status,
    branches,
    statusMap,
    dirtyDirs,
    refresh,
    refreshBranches,
    stageFile,
    unstageFile,
    discardFile,
    stageAll,
    unstageAll,
    commit,
    checkoutBranch,
  };
}
