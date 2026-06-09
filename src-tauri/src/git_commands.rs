use git2::{BranchType, Repository, Status, StatusOptions};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct GitFileEntry {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitStatusInfo {
    pub is_repo: bool,
    pub branch: String,
    pub is_dirty: bool,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<GitFileEntry>,
    pub modified: Vec<GitFileEntry>,
    pub untracked: Vec<GitFileEntry>,
    pub conflicted: Vec<GitFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitBranchEntry {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

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

    // Ahead / behind
    let (ahead, behind) = head
        .as_ref()
        .and_then(|h| h.target())
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

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let st = entry.status();

        // Make path absolute for frontend matching
        let abs_path = repo_root.join(&path).to_string_lossy().to_string();

        if st.contains(Status::CONFLICTED) {
            conflicted.push(GitFileEntry { path: abs_path, status: "conflicted".into() });
        } else if st.intersects(Status::INDEX_NEW | Status::INDEX_MODIFIED | Status::INDEX_DELETED | Status::INDEX_RENAMED | Status::INDEX_TYPECHANGE) {
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

            // A file can be both staged and have unstaged modifications
            if st.intersects(Status::WT_MODIFIED | Status::WT_DELETED) {
                let wt_label = if st.contains(Status::WT_DELETED) { "deleted" } else { "modified" };
                modified.push(GitFileEntry { path: abs_path, status: wt_label.into() });
            }
        } else if st.intersects(Status::WT_NEW) {
            untracked.push(GitFileEntry { path: abs_path, status: "untracked".into() });
        } else if st.intersects(Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_RENAMED | Status::WT_TYPECHANGE) {
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

#[tauri::command]
pub fn git_checkout_branch(project_path: String, branch_name: String) -> Result<(), String> {
    let repo = open_repo(&project_path)?;

    // Check for a local branch first
    let obj = repo
        .revparse_single(&format!("refs/heads/{}", branch_name))
        .or_else(|_| {
            // If the name looks like origin/foo, try that ref directly
            repo.revparse_single(&format!("refs/remotes/{}", branch_name))
        })
        .map_err(|e| e.message().to_string())?;

    let commit = obj.peel_to_commit().map_err(|e| e.message().to_string())?;

    // If it's a remote branch (e.g., origin/feature), create a local tracking branch
    let local_name = if branch_name.contains('/') {
        branch_name.split('/').last().unwrap_or(&branch_name).to_string()
    } else {
        branch_name.clone()
    };

    // Try to find or create local branch
    if repo.find_branch(&local_name, BranchType::Local).is_err() && branch_name.contains('/') {
        repo.branch(&local_name, &commit, false)
            .map_err(|e| e.message().to_string())?;
    }

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
            // Reset this file's index entry to what it was in HEAD
            let tree_entry = tree.get_path(relative).ok();
            if let Some(entry) = tree_entry {
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
                // File didn't exist in HEAD, remove from index
                index.remove_path(relative).map_err(|e| e.message().to_string())?;
            }
        }
        None => {
            // No HEAD (initial commit) — remove from index
            index.remove_path(relative).map_err(|e| e.message().to_string())?;
        }
    }

    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

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
