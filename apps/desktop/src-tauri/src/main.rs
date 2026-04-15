#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownPathChange {
    note_id: String,
    previous_path: String,
    next_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexRefreshRequest {
    note_ids: Vec<String>,
    reason: IndexRefreshReason,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum IndexRefreshReason {
    NoteMove,
    FolderRename,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexRefreshSidecarEntry {
    note_ids: Vec<String>,
    reason: IndexRefreshReason,
    queued_at_unix_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    code: &'static str,
    message: String,
}

impl CommandError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[tauri::command]
async fn move_markdown_file(
    app_handle: tauri::AppHandle,
    change: MarkdownPathChange,
) -> Result<(), CommandError> {
    if change.note_id.trim().is_empty() {
        return Err(CommandError::new(
            "invalid_note_id",
            "A note id is required to move a Markdown file.",
        ));
    }

    let workspace_root = default_workspace_root(&app_handle)?;
    let previous_path = resolve_markdown_path(&workspace_root, &change.previous_path)?;
    let next_path = resolve_markdown_path(&workspace_root, &change.next_path)?;

    move_file_without_overwrite(&previous_path, &next_path)
        .await
        .map_err(|error| CommandError::new("file_move_failed", error.to_string()))
}

#[tauri::command]
async fn refresh_note_indexes(
    app_handle: tauri::AppHandle,
    refresh: IndexRefreshRequest,
) -> Result<(), CommandError> {
    if refresh
        .note_ids
        .iter()
        .any(|note_id| note_id.trim().is_empty())
    {
        return Err(CommandError::new(
            "invalid_note_id",
            "Index refresh requests cannot contain an empty note id.",
        ));
    }

    append_index_refresh_sidecar_entry(&app_handle, refresh)
        .await
        .map_err(|error| CommandError::new("index_refresh_failed", error.to_string()))
}

fn main() {
    if let Err(error) = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            move_markdown_file,
            refresh_note_indexes
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("failed to run Grove desktop app: {error}");
    }
}

fn default_workspace_root(app_handle: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    app_handle
        .path()
        .app_data_dir()
        .map(|path| path.join("workspaces").join("default"))
        .map_err(|error| CommandError::new("workspace_root_unavailable", error.to_string()))
}

fn resolve_markdown_path(workspace_root: &Path, path: &str) -> Result<PathBuf, CommandError> {
    validate_markdown_path(path)?;
    Ok(workspace_root.join(path))
}

fn validate_markdown_path(path: &str) -> Result<(), CommandError> {
    let markdown_path = Path::new(path);

    if markdown_path.components().next().is_none() {
        return Err(CommandError::new(
            "invalid_markdown_path",
            "Markdown file paths cannot be empty.",
        ));
    }

    for component in markdown_path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(CommandError::new(
                "invalid_markdown_path",
                "Markdown file paths must stay inside the workspace.",
            ));
        }
    }

    if markdown_path
        .extension()
        .and_then(|extension| extension.to_str())
        != Some("md")
    {
        return Err(CommandError::new(
            "invalid_markdown_path",
            "Only Markdown files can be moved by folder path changes.",
        ));
    }

    Ok(())
}

async fn move_file_without_overwrite(previous_path: &Path, next_path: &Path) -> anyhow::Result<()> {
    if !tokio::fs::try_exists(previous_path).await? {
        anyhow::bail!(
            "The source Markdown file does not exist: {}",
            previous_path.display()
        );
    }

    if tokio::fs::try_exists(next_path).await? {
        anyhow::bail!(
            "The target Markdown file already exists: {}",
            next_path.display()
        );
    }

    if let Some(parent_path) = next_path.parent() {
        tokio::fs::create_dir_all(parent_path).await?;
    }

    tokio::fs::rename(previous_path, next_path).await?;
    Ok(())
}

async fn append_index_refresh_sidecar_entry(
    app_handle: &tauri::AppHandle,
    refresh: IndexRefreshRequest,
) -> anyhow::Result<()> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    tokio::fs::create_dir_all(&app_data_dir).await?;

    let sidecar_path = app_data_dir.join("index-refresh-requests.jsonl");
    let queued_at_unix_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let entry = IndexRefreshSidecarEntry {
        note_ids: refresh.note_ids,
        reason: refresh.reason,
        queued_at_unix_ms,
    };
    let mut line = serde_json::to_vec(&entry)?;
    line.push(b'\n');

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(sidecar_path)
        .await?;
    file.write_all(&line).await?;
    file.flush().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_markdown_path;

    #[test]
    fn accepts_workspace_relative_markdown_paths() {
        assert!(validate_markdown_path("Projects/Grove/Plan.md").is_ok());
    }

    #[test]
    fn rejects_paths_that_escape_the_workspace() {
        let error = validate_markdown_path("../Plan.md").unwrap_err();

        assert_eq!(error.code, "invalid_markdown_path");
    }

    #[test]
    fn rejects_non_markdown_paths() {
        let error = validate_markdown_path("Projects/Grove/Plan.txt").unwrap_err();

        assert_eq!(error.code, "invalid_markdown_path");
    }
}
