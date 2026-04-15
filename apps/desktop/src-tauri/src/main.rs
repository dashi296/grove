#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadMarkdownNoteRequest {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteMarkdownNoteRequest {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum IndexRefreshReason {
    NoteMove,
    FolderRename,
    NoteSave,
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
struct ScannedMarkdownNote {
    path: String,
    title: String,
    updated_at_unix_ms: u128,
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

#[tauri::command]
async fn scan_markdown_workspace(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ScannedMarkdownNote>, CommandError> {
    let workspace_root = default_workspace_root(&app_handle)?;

    tokio::fs::create_dir_all(&workspace_root)
        .await
        .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))?;

    scan_markdown_files(&workspace_root)
        .await
        .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))
}

#[tauri::command]
async fn read_markdown_note(
    app_handle: tauri::AppHandle,
    note: ReadMarkdownNoteRequest,
) -> Result<String, CommandError> {
    let workspace_root = default_workspace_root(&app_handle)?;
    let note_path = resolve_markdown_path(&workspace_root, &note.path)?;

    read_markdown_file(&note_path)
        .await
        .map_err(|error| CommandError::new("note_read_failed", error.to_string()))
}

#[tauri::command]
async fn write_markdown_note(
    app_handle: tauri::AppHandle,
    note: WriteMarkdownNoteRequest,
) -> Result<ScannedMarkdownNote, CommandError> {
    let workspace_root = default_workspace_root(&app_handle)?;
    let note_path = resolve_markdown_path(&workspace_root, &note.path)?;

    write_markdown_file(&note_path, note.content.as_bytes())
        .await
        .map_err(|error| CommandError::new("note_write_failed", error.to_string()))?;

    summarize_markdown_file(&workspace_root, &note_path)
        .await
        .map_err(|error| CommandError::new("note_write_failed", error.to_string()))
}

fn main() {
    if let Err(error) = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            move_markdown_file,
            read_markdown_note,
            refresh_note_indexes,
            scan_markdown_workspace,
            write_markdown_note
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
    if has_windows_drive_prefix(path) {
        return Err(CommandError::new(
            "invalid_markdown_path",
            "Markdown file paths must not include a drive prefix.",
        ));
    }

    if path.contains('\\') {
        return Err(CommandError::new(
            "invalid_markdown_path",
            "Markdown file paths must use workspace separators.",
        ));
    }

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

    if !markdown_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err(CommandError::new(
            "invalid_markdown_path",
            "Only Markdown files can be moved by folder path changes.",
        ));
    }

    Ok(())
}

fn has_windows_drive_prefix(path: &str) -> bool {
    let path_bytes = path.as_bytes();

    path_bytes.len() >= 2 && path_bytes[0].is_ascii_alphabetic() && path_bytes[1] == b':'
}

async fn scan_markdown_files(workspace_root: &Path) -> anyhow::Result<Vec<ScannedMarkdownNote>> {
    let mut pending_dirs = vec![workspace_root.to_path_buf()];
    let mut notes = Vec::new();

    while let Some(directory) = pending_dirs.pop() {
        let mut entries = tokio::fs::read_dir(&directory).await?;

        while let Some(entry) = entries.next_entry().await? {
            let file_type = entry.file_type().await?;
            let path = entry.path();

            if file_type.is_dir() {
                pending_dirs.push(path);
                continue;
            }

            if !file_type.is_file() || !is_markdown_path(&path) {
                continue;
            }

            notes.push(summarize_markdown_file(workspace_root, &path).await?);
        }
    }

    notes.sort_by(|left, right| left.path.to_lowercase().cmp(&right.path.to_lowercase()));
    Ok(notes)
}

fn get_workspace_relative_markdown_path(
    workspace_root: &Path,
    markdown_path: &Path,
) -> anyhow::Result<String> {
    let relative_path = markdown_path.strip_prefix(workspace_root)?;
    let path = relative_path_to_workspace_path(relative_path)?;

    validate_markdown_path(&path)
        .map_err(|error| anyhow::anyhow!("{}: {}", error.code, error.message))?;

    Ok(path)
}

fn relative_path_to_workspace_path(relative_path: &Path) -> anyhow::Result<String> {
    let mut segments = Vec::new();

    for component in relative_path.components() {
        match component {
            Component::Normal(segment) => segments.push(segment.to_string_lossy().into_owned()),
            _ => anyhow::bail!("Markdown scan results must stay inside the workspace."),
        }
    }

    if segments.is_empty() {
        anyhow::bail!("Markdown scan results must include a file name.");
    }

    Ok(segments.join("/"))
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

fn system_time_to_unix_ms(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis())
}

async fn read_note_title(path: &Path) -> anyhow::Result<String> {
    let fallback_title = path
        .file_stem()
        .and_then(|file_stem| file_stem.to_str())
        .unwrap_or("Untitled")
        .trim()
        .to_string();

    let content = read_markdown_file(path).await?;

    Ok(find_first_markdown_heading(&content).unwrap_or(fallback_title))
}

async fn read_markdown_file(path: &Path) -> anyhow::Result<String> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut content = String::new();
    file.read_to_string(&mut content).await?;
    Ok(content)
}

async fn write_markdown_file(path: &Path, content: &[u8]) -> anyhow::Result<()> {
    if let Some(parent_path) = path.parent() {
        tokio::fs::create_dir_all(parent_path).await?;
    }

    let mut file = tokio::fs::File::create(path).await?;
    file.write_all(content).await?;
    file.flush().await?;
    Ok(())
}

async fn summarize_markdown_file(
    workspace_root: &Path,
    markdown_path: &Path,
) -> anyhow::Result<ScannedMarkdownNote> {
    let relative_path = get_workspace_relative_markdown_path(workspace_root, markdown_path)?;
    let metadata = tokio::fs::metadata(markdown_path).await?;
    let updated_at_unix_ms = system_time_to_unix_ms(metadata.modified()?);
    let title = read_note_title(markdown_path).await?;

    Ok(ScannedMarkdownNote {
        path: relative_path,
        title,
        updated_at_unix_ms,
    })
}

fn find_first_markdown_heading(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed_line = line.trim_start();
        let heading_marker_len = trimmed_line
            .chars()
            .take_while(|character| *character == '#')
            .count();

        if heading_marker_len == 0 || heading_marker_len > 6 {
            continue;
        }

        let heading_body = &trimmed_line[heading_marker_len..];

        if !heading_body.starts_with(char::is_whitespace) {
            continue;
        }

        let title = strip_closing_heading_marker(heading_body.trim());

        if title.is_empty() {
            continue;
        }

        return Some(title.to_string());
    }

    None
}

fn strip_closing_heading_marker(title: &str) -> &str {
    let trimmed_title = title.trim_end();
    let without_hashes = trimmed_title.trim_end_matches('#');

    if without_hashes.len() == trimmed_title.len() {
        return trimmed_title;
    }

    if without_hashes
        .chars()
        .next_back()
        .is_some_and(char::is_whitespace)
    {
        return without_hashes.trim_end();
    }

    trimmed_title
}

async fn move_file_without_overwrite(previous_path: &Path, next_path: &Path) -> anyhow::Result<()> {
    if !tokio::fs::try_exists(previous_path).await? {
        if tokio::fs::try_exists(next_path).await? {
            return Ok(());
        }

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
    use std::{
        path::PathBuf,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use super::{
        find_first_markdown_heading, get_workspace_relative_markdown_path,
        move_file_without_overwrite, read_markdown_file, scan_markdown_files,
        system_time_to_unix_ms, validate_markdown_path, write_markdown_file,
    };

    fn run_async<F>(future: F) -> F::Output
    where
        F: std::future::Future,
    {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime should build")
            .block_on(future)
    }

    fn unique_test_dir(test_name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!(
            "grove-{test_name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    #[test]
    fn accepts_workspace_relative_markdown_paths() {
        assert!(validate_markdown_path("Projects/Grove/Plan.md").is_ok());
    }

    #[test]
    fn accepts_markdown_paths_with_uppercase_extensions() {
        assert!(validate_markdown_path("Projects/Grove/Plan.MD").is_ok());
    }

    #[test]
    fn rejects_paths_that_escape_the_workspace() {
        let error = validate_markdown_path("../Plan.md").unwrap_err();

        assert_eq!(error.code, "invalid_markdown_path");
    }

    #[test]
    fn rejects_paths_with_drive_prefixes() {
        let error = validate_markdown_path("C:/Projects/Grove/Plan.md").unwrap_err();

        assert_eq!(error.code, "invalid_markdown_path");
    }

    #[test]
    fn rejects_paths_with_backslashes() {
        let error = validate_markdown_path("Projects\\Grove\\Plan.md").unwrap_err();

        assert_eq!(error.code, "invalid_markdown_path");
    }

    #[test]
    fn rejects_non_markdown_paths() {
        let error = validate_markdown_path("Projects/Grove/Plan.txt").unwrap_err();

        assert_eq!(error.code, "invalid_markdown_path");
    }

    #[test]
    fn derives_workspace_relative_markdown_paths() {
        let workspace_dir = PathBuf::from("/workspace");
        let markdown_path = workspace_dir.join("Projects").join("Grove").join("Plan.md");

        let path = get_workspace_relative_markdown_path(&workspace_dir, &markdown_path)
            .expect("relative Markdown path should be derived");

        assert_eq!(path, "Projects/Grove/Plan.md");
    }

    #[test]
    fn rejects_scan_paths_outside_the_workspace() {
        let workspace_dir = PathBuf::from("/workspace");
        let markdown_path = PathBuf::from("/other").join("Plan.md");

        let error = get_workspace_relative_markdown_path(&workspace_dir, &markdown_path)
            .expect_err("outside paths should be rejected");

        assert!(error.to_string().contains("prefix"));
    }

    #[test]
    fn reads_first_markdown_heading_as_title() {
        let title = find_first_markdown_heading("#tag\n\n## Project plan ##\nbody")
            .expect("heading should be found");

        assert_eq!(title, "Project plan");
    }

    #[test]
    fn keeps_hash_characters_that_are_part_of_the_heading_title() {
        let title = find_first_markdown_heading("# C#").expect("heading should be found");

        assert_eq!(title, "C#");
    }

    #[test]
    fn clamps_pre_epoch_scan_timestamps_to_zero() {
        let updated_at_unix_ms = system_time_to_unix_ms(UNIX_EPOCH - Duration::from_millis(1));

        assert_eq!(updated_at_unix_ms, 0);
    }

    #[test]
    fn scans_markdown_files_and_ignores_other_files() {
        run_async(async {
            let workspace_dir = unique_test_dir("scans-markdown-files");
            let plan_path = workspace_dir.join("Projects").join("Plan.md");
            let notes_path = workspace_dir.join("Inbox.MD");
            let text_path = workspace_dir.join("Projects").join("Draft.txt");
            tokio::fs::create_dir_all(plan_path.parent().expect("plan parent")).await?;
            tokio::fs::write(&plan_path, "# Plan\nbody").await?;
            tokio::fs::write(&notes_path, "no heading").await?;
            tokio::fs::write(&text_path, "# Draft").await?;

            let notes = scan_markdown_files(&workspace_dir).await?;

            assert_eq!(notes.len(), 2);
            assert_eq!(notes[0].path, "Inbox.MD");
            assert_eq!(notes[0].title, "Inbox");
            assert_eq!(notes[1].path, "Projects/Plan.md");
            assert_eq!(notes[1].title, "Plan");
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("workspace scan should succeed");
    }

    #[test]
    fn reads_markdown_file_content() {
        run_async(async {
            let workspace_dir = unique_test_dir("reads-markdown-file-content");
            let note_path = workspace_dir.join("Projects").join("Plan.md");
            tokio::fs::create_dir_all(note_path.parent().expect("note parent")).await?;
            tokio::fs::write(&note_path, "# Plan\n\nBody").await?;

            let content = read_markdown_file(&note_path).await?;

            assert_eq!(content, "# Plan\n\nBody");
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("Markdown read should succeed");
    }

    #[test]
    fn writes_markdown_file_content() {
        run_async(async {
            let workspace_dir = unique_test_dir("writes-markdown-file-content");
            let note_path = workspace_dir.join("Projects").join("Plan.md");

            write_markdown_file(&note_path, b"# Plan\n\nSaved").await?;

            assert_eq!(
                tokio::fs::read_to_string(&note_path).await?,
                "# Plan\n\nSaved"
            );
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("Markdown write should succeed");
    }

    #[test]
    fn moves_files_without_overwriting_targets() {
        run_async(async {
            let workspace_dir = unique_test_dir("moves-files-without-overwriting-targets");
            let previous_path = workspace_dir.join("Projects").join("Plan.md");
            let next_path = workspace_dir.join("Reading").join("Plan.md");
            tokio::fs::create_dir_all(previous_path.parent().expect("source parent")).await?;
            tokio::fs::write(&previous_path, "plan").await?;

            move_file_without_overwrite(&previous_path, &next_path).await?;

            assert!(!tokio::fs::try_exists(&previous_path).await?);
            assert_eq!(tokio::fs::read_to_string(&next_path).await?, "plan");
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("file move should succeed");
    }

    #[test]
    fn treats_already_moved_files_as_successful_for_retries() {
        run_async(async {
            let workspace_dir = unique_test_dir("treats-already-moved-files-as-successful");
            let previous_path = workspace_dir.join("Projects").join("Plan.md");
            let next_path = workspace_dir.join("Reading").join("Plan.md");
            tokio::fs::create_dir_all(next_path.parent().expect("target parent")).await?;
            tokio::fs::write(&next_path, "plan").await?;

            move_file_without_overwrite(&previous_path, &next_path).await?;

            assert_eq!(tokio::fs::read_to_string(&next_path).await?, "plan");
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("already moved file should be idempotent");
    }

    #[test]
    fn rejects_existing_targets_when_source_still_exists() {
        run_async(async {
            let workspace_dir = unique_test_dir("rejects-existing-targets");
            let previous_path = workspace_dir.join("Projects").join("Plan.md");
            let next_path = workspace_dir.join("Reading").join("Plan.md");
            tokio::fs::create_dir_all(previous_path.parent().expect("source parent")).await?;
            tokio::fs::create_dir_all(next_path.parent().expect("target parent")).await?;
            tokio::fs::write(&previous_path, "source").await?;
            tokio::fs::write(&next_path, "target").await?;

            let error = move_file_without_overwrite(&previous_path, &next_path)
                .await
                .expect_err("existing target should be rejected");

            assert!(error.to_string().contains("already exists"));
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("target collision test should run");
    }
}
