import { useState, useEffect, useCallback, useRef } from "react";
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

  // Build a map of absolute path → status string for the file tree
  const statusMap = new Map<string, string>();
  if (status.is_repo) {
    for (const f of status.staged) statusMap.set(f.path, "staged");
    for (const f of status.modified) statusMap.set(f.path, f.status);
    for (const f of status.untracked) statusMap.set(f.path, "untracked");
    for (const f of status.conflicted) statusMap.set(f.path, "conflicted");
  }

  return {
    status,
    branches,
    statusMap,
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
