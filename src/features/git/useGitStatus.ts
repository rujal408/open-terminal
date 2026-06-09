import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitStatusInfo, GitBranchEntry } from "../../types";

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

export function useGitStatus(projectPath: string | null) {
  const [status, setStatus] = useState<GitStatusInfo>(EMPTY_STATUS);
  const [branches, setBranches] = useState<GitBranchEntry[]>([]);
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

  // Poll git status
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

  // Build a stable map of absolute path → status string, and a set of dirty parent dirs.
  // Memoized so FileTree (memo'd) doesn't re-render when poll returns identical data.
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
