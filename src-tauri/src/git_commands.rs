//! Git operations exposed as Tauri IPC commands.
//!
//! Uses `git2` (libgit2 bindings) to interact with the repository directly
//! rather than shelling out to the `git` CLI. This avoids dependency on
//! the user having git installed and gives us structured data.

use git2::{BranchType, Repository, Status, StatusOptions};
use serde::Serialize;
use std::path::Path;

/// A single file with its git status label (e.g. "modified", "added", "deleted").
#[derive(Debug, Clone, Serialize)]
pub struct GitFileEntry {
    pub path: String,
    pub status: String,
}

/// Complete snapshot of a repository's status, sent to the frontend to populate
/// the source control panel.
#[derive(Debug, Clone, Serialize)]
pub struct GitStatusInfo {
    pub is_repo: bool,
    pub branch: String,
    pub is_dirty: bool,
    /// Number of local commits not yet pushed to origin
    pub ahead: usize,
    /// Number of origin commits not yet pulled locally
    pub behind: usize,
    /// Files in the staging area (index), ready to be committed
    pub staged: Vec<GitFileEntry>,
    /// Files with working-tree changes not yet staged
    pub modified: Vec<GitFileEntry>,
    /// New files that git doesn't track yet
    pub untracked: Vec<GitFileEntry>,
    /// Files with merge conflicts that need manual resolution
    pub conflicted: Vec<GitFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitBranchEntry {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

/// Opens a git repository by discovering it from the given path. Uses
/// `Repository::discover` which walks up the directory tree until it finds a
/// `.git` directory. This means the user can open a subdirectory of a repo
/// and git features will still work.
fn open_repo(project_path: &str) -> Result<Repository, String> {
    Repository::discover(project_path).map_err(|e| e.message().to_string())
}

#[tauri::command]
pub fn git_status(project_path: String) -> Result<GitStatusInfo, String> {
    let repo = match open_repo(&project_path) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitStatusInfo {
                is_repo: false,
                branch: String::new(),
                is_dirty: false,
                ahead: 0,
                behind: 0,
                staged: vec![],
                modified: vec![],
                untracked: vec![],
                conflicted: vec![],
            });
        }
    };

    let head = repo.head().ok();
    let branch = head
        .as_ref()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "HEAD (detached)".into());

    // Ahead / behind: compare the local branch tip against its remote tracking
    // branch (origin/<branch>). `graph_ahead_behind` walks the commit graph to
    // count commits reachable from one side but not the other.
    // Returns (0, 0) if there's no remote tracking branch or HEAD is detached.
    let (ahead, behind) = head
        .as_ref()
        .and_then(|h| h.target()) // Get the OID (commit hash) of HEAD
        .and_then(|local_oid| {
            let branch_name = repo.head().ok()?.shorthand()?.to_string();
            let upstream_name = format!("origin/{}", branch_name);
            let upstream_ref = repo.find_reference(&format!("refs/remotes/{}", upstream_name)).ok()?;
            let upstream_oid = upstream_ref.target()?;
            repo.graph_ahead_behind(local_oid, upstream_oid).ok()
        })
        .unwrap_or((0, 0));

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.message().to_string())?;

    let mut staged = Vec::new();
    let mut modified = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicted = Vec::new();

    let repo_root = repo.workdir().unwrap_or_else(|| Path::new(""));

    // Categorize each changed file into one of four buckets. Git status flags
    // use a bitmask: INDEX_* flags are for the staging area (index), WT_* flags
    // are for working-tree (unstaged) changes.
    //
    // A single file can appear in multiple buckets — e.g. a file that is staged
    // but then modified again will show up in both `staged` and `modified`.
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let st = entry.status();

        // Convert repo-relative path to absolute so the frontend can match it
        // against the file tree entries which also use absolute paths.
        let abs_path = repo_root.join(&path).to_string_lossy().to_string();

        if st.contains(Status::CONFLICTED) {
            // Merge conflict — must be resolved before committing
            conflicted.push(GitFileEntry { path: abs_path, status: "conflicted".into() });
        } else if st.intersects(Status::INDEX_NEW | Status::INDEX_MODIFIED | Status::INDEX_DELETED | Status::INDEX_RENAMED | Status::INDEX_TYPECHANGE) {
            // File has changes in the staging area (ready to commit)
            let label = if st.contains(Status::INDEX_NEW) {
                "added"
            } else if st.contains(Status::INDEX_DELETED) {
                "deleted"
            } else if st.contains(Status::INDEX_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            staged.push(GitFileEntry { path: abs_path.clone(), status: label.into() });

            // A file can be both staged AND have additional unstaged edits on top.
            // Example: you stage a file, then edit it again without staging.
            if st.intersects(Status::WT_MODIFIED | Status::WT_DELETED) {
                let wt_label = if st.contains(Status::WT_DELETED) { "deleted" } else { "modified" };
                modified.push(GitFileEntry { path: abs_path, status: wt_label.into() });
            }
        } else if st.intersects(Status::WT_NEW) {
            // Brand new file that git doesn't track yet
            untracked.push(GitFileEntry { path: abs_path, status: "untracked".into() });
        } else if st.intersects(Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_RENAMED | Status::WT_TYPECHANGE) {
            // Working-tree changes that haven't been staged yet
            let label = if st.contains(Status::WT_DELETED) {
                "deleted"
            } else if st.contains(Status::WT_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            modified.push(GitFileEntry { path: abs_path, status: label.into() });
        }
    }

    let is_dirty = !staged.is_empty() || !modified.is_empty() || !untracked.is_empty() || !conflicted.is_empty();

    Ok(GitStatusInfo {
        is_repo: true,
        branch,
        is_dirty,
        ahead,
        behind,
        staged,
        modified,
        untracked,
        conflicted,
    })
}

#[tauri::command]
pub fn git_branches(project_path: String) -> Result<Vec<GitBranchEntry>, String> {
    let repo = open_repo(&project_path)?;
    let mut entries = Vec::new();

    let head = repo.head().ok();
    let current = head.as_ref().and_then(|h| h.shorthand().map(String::from));

    // Local branches
    let branches = repo.branches(Some(BranchType::Local)).map_err(|e| e.message().to_string())?;
    for branch in branches {
        let (branch, _) = branch.map_err(|e| e.message().to_string())?;
        if let Ok(Some(name)) = branch.name() {
            entries.push(GitBranchEntry {
                name: name.to_string(),
                is_current: current.as_deref() == Some(name),
                is_remote: false,
            });
        }
    }

    // Remote branches
    let remote_branches = repo.branches(Some(BranchType::Remote)).map_err(|e| e.message().to_string())?;
    for branch in remote_branches {
        let (branch, _) = branch.map_err(|e| e.message().to_string())?;
        if let Ok(Some(name)) = branch.name() {
            // Skip HEAD pointers
            if name.ends_with("/HEAD") {
                continue;
            }
            entries.push(GitBranchEntry {
                name: name.to_string(),
                is_current: false,
                is_remote: true,
            });
        }
    }

    Ok(entries)
}

/// Checkout a branch by name. Handles both local and remote branches.
///
/// For remote branches (e.g. "origin/feature-x"):
///   1. Resolve the remote ref to a commit
///   2. Extract the short name ("feature-x") from "origin/feature-x"
///   3. Create a local branch pointing to that commit (if one doesn't exist)
///   4. Checkout the local branch
///
/// This mimics `git checkout feature-x` when a local branch doesn't exist
/// but a remote tracking branch does.
#[tauri::command]
pub fn git_checkout_branch(project_path: String, branch_name: String) -> Result<(), String> {
    let repo = open_repo(&project_path)?;

    // Try to resolve as a local branch first, fall back to remote ref
    let obj = repo
        .revparse_single(&format!("refs/heads/{}", branch_name))
        .or_else(|_| {
            repo.revparse_single(&format!("refs/remotes/{}", branch_name))
        })
        .map_err(|e| e.message().to_string())?;

    let commit = obj.peel_to_commit().map_err(|e| e.message().to_string())?;

    // For remote branches like "origin/feature-x", extract just "feature-x"
    // to use as the local branch name
    let local_name = if branch_name.contains('/') {
        branch_name.split('/').last().unwrap_or(&branch_name).to_string()
    } else {
        branch_name.clone()
    };

    // If no local branch exists and this is a remote branch, create a local
    // tracking branch pointing to the same commit
    if repo.find_branch(&local_name, BranchType::Local).is_err() && branch_name.contains('/') {
        repo.branch(&local_name, &commit, false)
            .map_err(|e| e.message().to_string())?;
    }

    // Checkout the working tree to match the branch, then update HEAD
    let obj = repo
        .revparse_single(&format!("refs/heads/{}", local_name))
        .map_err(|e| e.message().to_string())?;

    repo.checkout_tree(&obj, None)
        .map_err(|e| e.message().to_string())?;

    repo.set_head(&format!("refs/heads/{}", local_name))
        .map_err(|e| e.message().to_string())?;

    Ok(())
}

#[tauri::command]
pub fn git_stage_file(project_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&project_path)?;
    let repo_root = repo.workdir().ok_or("bare repository")?;

    let relative = Path::new(&file_path)
        .strip_prefix(repo_root)
        .map_err(|_| "file not within repository")?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;

    if Path::new(&file_path).exists() {
        index.add_path(relative).map_err(|e| e.message().to_string())?;
    } else {
        index.remove_path(relative).map_err(|e| e.message().to_string())?;
    }

    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

/// Unstage a single file — the equivalent of `git reset HEAD <file>`.
///
/// How it works: we restore the file's index (staging area) entry to match
/// what it looked like in the HEAD commit. This effectively "un-adds" the file
/// without touching the working tree.
///
/// Three cases:
///   1. File exists in HEAD: replace the index entry with the HEAD version
///   2. File is new (not in HEAD): remove it from the index entirely
///   3. No HEAD exists (initial commit): remove from index
#[tauri::command]
pub fn git_unstage_file(project_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&project_path)?;
    let repo_root = repo.workdir().ok_or("bare repository")?;

    let relative = Path::new(&file_path)
        .strip_prefix(repo_root)
        .map_err(|_| "file not within repository")?;

    let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

    let mut index = repo.index().map_err(|e| e.message().to_string())?;

    match head {
        Some(tree) => {
            // Case 1 & 2: HEAD exists — check if the file was in that commit
            let tree_entry = tree.get_path(relative).ok();
            if let Some(entry) = tree_entry {
                // Case 1: File existed in HEAD. Reconstruct the index entry from
                // the HEAD tree's version of this file (same OID, mode, content).
                // This overwrites whatever was staged with the original version.
                let blob = repo.find_blob(entry.id()).map_err(|e| e.message().to_string())?;
                index
                    .add_frombuffer(
                        &git2::IndexEntry {
                            ctime: git2::IndexTime::new(0, 0),
                            mtime: git2::IndexTime::new(0, 0),
                            dev: 0,
                            ino: 0,
                            mode: entry.filemode() as u32,
                            uid: 0,
                            gid: 0,
                            file_size: blob.content().len() as u32,
                            id: entry.id(),
                            flags: 0,
                            flags_extended: 0,
                            path: relative.to_string_lossy().as_bytes().to_vec(),
                        },
                        blob.content(),
                    )
                    .map_err(|e| e.message().to_string())?;
            } else {
                // Case 2: File didn't exist in HEAD (newly added), so unstaging
                // means removing it from the index entirely
                index.remove_path(relative).map_err(|e| e.message().to_string())?;
            }
        }
        None => {
            // Case 3: No HEAD (initial commit) — nothing to reset to, just
            // remove from the index
            index.remove_path(relative).map_err(|e| e.message().to_string())?;
        }
    }

    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

/// Discard working-tree changes for a single file — equivalent to
/// `git checkout HEAD -- <file>`.
///
/// This overwrites the file on disk with the version from HEAD, permanently
/// discarding any unsaved modifications. The `.force()` flag is needed to
/// allow overwriting the existing file content.
#[tauri::command]
pub fn git_discard_file(project_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&project_path)?;
    let repo_root = repo.workdir().ok_or("bare repository")?;

    let relative = Path::new(&file_path)
        .strip_prefix(repo_root)
        .map_err(|_| "file not within repository")?;

    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.path(relative).force();

    repo.checkout_head(Some(&mut checkout_opts))
        .map_err(|e| e.message().to_string())?;

    Ok(())
}

#[tauri::command]
pub fn git_commit(project_path: String, message: String) -> Result<String, String> {
    let repo = open_repo(&project_path)?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.message().to_string())?;

    let sig = repo.signature().map_err(|e| e.message().to_string())?;

    let parent_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.message().to_string())?;

    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_stage_all(project_path: String) -> Result<(), String> {
    let repo = open_repo(&project_path)?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn git_unstage_all(project_path: String) -> Result<(), String> {
    let repo = open_repo(&project_path)?;

    let head = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_tree().ok());

    match head {
        Some(tree) => {
            repo.reset_default(Some(tree.as_object()), std::iter::empty::<&str>())
                .map_err(|_| {
                    // Fallback: reset index to tree
                    let mut index = repo.index().unwrap();
                    index.read_tree(&tree).unwrap();
                    index.write().unwrap();
                })
                .ok();
        }
        None => {
            // No HEAD — clear the entire index
            let mut index = repo.index().map_err(|e| e.message().to_string())?;
            index.clear().map_err(|e| e.message().to_string())?;
            index.write().map_err(|e| e.message().to_string())?;
        }
    }

    Ok(())
}
