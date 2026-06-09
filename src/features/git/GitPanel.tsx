import { useState, useCallback, memo } from "react";
import { VscGitCompare, VscCheck, VscDiscard, VscDiffAdded, VscDiffRemoved, VscRefresh, VscGitCommit } from "react-icons/vsc";
import type { GitStatusInfo, GitBranchEntry } from "../../types";

interface GitPanelProps {
  status: GitStatusInfo;
  branches: GitBranchEntry[];
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (path: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onCommit: (message: string) => void;
  onCheckoutBranch: (name: string) => void;
  onRefreshBranches: () => void;
}

function basename(path: string) {
  return path.split("/").pop() || path;
}

const statusBadge: Record<string, { label: string; colorVar: string }> = {
  added: { label: "A", colorVar: "--git-added" },
  modified: { label: "M", colorVar: "--git-modified" },
  deleted: { label: "D", colorVar: "--git-deleted" },
  renamed: { label: "R", colorVar: "--git-modified" },
  untracked: { label: "U", colorVar: "--git-untracked" },
  conflicted: { label: "C", colorVar: "--git-conflicted" },
  staged: { label: "S", colorVar: "--git-added" },
};

function StatusBadge({ status }: { status: string }) {
  const info = statusBadge[status] || { label: "?", colorVar: "--text-muted" };
  return (
    <span
      className="text-[10px] font-bold w-4 text-center shrink-0"
      style={{ color: `var(${info.colorVar})` }}
    >
      {info.label}
    </span>
  );
}

function FileRow({
  path,
  status,
  actions,
}: {
  path: string;
  status: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="group flex items-center gap-1 py-[2px] px-2 text-[12px] hover:bg-border">
      <StatusBadge status={status} />
      <span
        className="flex-1 truncate"
        style={{ color: `var(${statusBadge[status]?.colorVar || "--text"})` }}
        title={path}
      >
        {basename(path)}
      </span>
      <span className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {actions}
      </span>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="bg-transparent border-none text-muted cursor-pointer p-0 hover:text-primary"
    >
      {children}
    </button>
  );
}

export const GitPanel = memo(function GitPanel({
  status,
  branches,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  onCommit,
  onCheckoutBranch,
  onRefreshBranches,
}: GitPanelProps) {
  const [commitMsg, setCommitMsg] = useState("");
  const [showBranches, setShowBranches] = useState(false);

  const handleCommit = useCallback(() => {
    if (!commitMsg.trim()) return;
    onCommit(commitMsg.trim());
    setCommitMsg("");
  }, [commitMsg, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        handleCommit();
      }
    },
    [handleCommit]
  );

  if (!status.is_repo) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-xs px-4 text-center">
        Not a git repository
      </div>
    );
  }

  const totalChanges =
    status.staged.length +
    status.modified.length +
    status.untracked.length +
    status.conflicted.length;

  return (
    <div className="flex flex-col h-full overflow-hidden text-primary">
      {/* Branch header */}
      <div className="shrink-0 border-b border-border">
        <button
          onClick={() => {
            onRefreshBranches();
            setShowBranches((p) => !p);
          }}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 bg-transparent border-none text-primary text-[13px] cursor-pointer hover:bg-border"
        >
          <VscGitCompare className="shrink-0 text-accent" />
          <span className="font-medium truncate">{status.branch}</span>
          {status.is_dirty && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--git-modified)" }} />
          )}
          {status.ahead > 0 && (
            <span className="text-[10px] text-muted">↑{status.ahead}</span>
          )}
          {status.behind > 0 && (
            <span className="text-[10px] text-muted">↓{status.behind}</span>
          )}
        </button>

        {/* Branch dropdown */}
        {showBranches && (
          <div className="max-h-48 overflow-y-auto border-t border-border">
            {branches.map((b) => (
              <button
                key={`${b.is_remote ? "r" : "l"}-${b.name}`}
                onClick={() => {
                  onCheckoutBranch(b.name);
                  setShowBranches(false);
                }}
                className={`flex items-center gap-1.5 w-full px-3 py-1 text-[12px] border-none cursor-pointer text-left ${
                  b.is_current
                    ? "bg-border text-primary"
                    : "bg-transparent text-primary hover:bg-border"
                }`}
              >
                {b.is_current && <VscCheck className="shrink-0 text-accent" size={12} />}
                <span className={`truncate ${b.is_remote ? "text-muted" : ""}`}>
                  {b.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Commit input */}
      <div className="shrink-0 p-2 border-b border-border">
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Commit message"
          rows={3}
          className="w-full bg-app border border-border rounded text-primary text-[12px] px-2 py-1 resize-none outline-none focus:border-accent"
        />
        <button
          onClick={handleCommit}
          disabled={!commitMsg.trim() || status.staged.length === 0}
          className="flex items-center justify-center gap-1 w-full mt-1 py-1 bg-accent border-none rounded text-app text-[12px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        >
          <VscGitCommit size={14} />
          Commit{status.staged.length > 0 && ` (${status.staged.length})`}
        </button>
      </div>

      {/* Changes list */}
      <div className="flex-1 overflow-y-auto">
        {totalChanges === 0 && (
          <div className="text-muted text-xs px-3 py-4 text-center">
            No changes
          </div>
        )}

        {/* Staged changes */}
        {status.staged.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
              <span>Staged ({status.staged.length})</span>
              <IconBtn title="Unstage all" onClick={onUnstageAll}>
                <VscDiffRemoved size={14} />
              </IconBtn>
            </div>
            {status.staged.map((f) => (
              <FileRow
                key={f.path}
                path={f.path}
                status={f.status}
                actions={
                  <IconBtn title="Unstage" onClick={() => onUnstageFile(f.path)}>
                    <VscDiffRemoved size={14} />
                  </IconBtn>
                }
              />
            ))}
          </div>
        )}

        {/* Modified (unstaged) changes */}
        {status.modified.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
              <span>Changes ({status.modified.length})</span>
              <span className="flex gap-0.5">
                <IconBtn title="Stage all" onClick={onStageAll}>
                  <VscDiffAdded size={14} />
                </IconBtn>
              </span>
            </div>
            {status.modified.map((f) => (
              <FileRow
                key={f.path}
                path={f.path}
                status={f.status}
                actions={
                  <>
                    <IconBtn title="Discard" onClick={() => onDiscardFile(f.path)}>
                      <VscDiscard size={14} />
                    </IconBtn>
                    <IconBtn title="Stage" onClick={() => onStageFile(f.path)}>
                      <VscDiffAdded size={14} />
                    </IconBtn>
                  </>
                }
              />
            ))}
          </div>
        )}

        {/* Untracked files */}
        {status.untracked.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
              <span>Untracked ({status.untracked.length})</span>
              <IconBtn title="Stage all" onClick={onStageAll}>
                <VscDiffAdded size={14} />
              </IconBtn>
            </div>
            {status.untracked.map((f) => (
              <FileRow
                key={f.path}
                path={f.path}
                status="untracked"
                actions={
                  <IconBtn title="Stage" onClick={() => onStageFile(f.path)}>
                    <VscDiffAdded size={14} />
                  </IconBtn>
                }
              />
            ))}
          </div>
        )}

        {/* Conflicts */}
        {status.conflicted.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
              Conflicts ({status.conflicted.length})
            </div>
            {status.conflicted.map((f) => (
              <FileRow
                key={f.path}
                path={f.path}
                status="conflicted"
                actions={
                  <IconBtn title="Stage (mark resolved)" onClick={() => onStageFile(f.path)}>
                    <VscDiffAdded size={14} />
                  </IconBtn>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 flex items-center gap-2 px-2 py-1 border-t border-border text-[10px] text-muted">
        <VscRefresh className="shrink-0" />
        <span>
          {totalChanges} change{totalChanges !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
});
