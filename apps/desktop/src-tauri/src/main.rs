#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    future::Future,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{bail, Context};
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
struct CreateMarkdownNoteRequest {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMarkdownFolderRequest {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteMarkdownNoteRequest {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteMarkdownNoteRequest {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddWorkspaceRequest {
    name: String,
    root_path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceIdRequest {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameWorkspaceRequest {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum IndexRefreshReason {
    NoteMove,
    FolderRename,
    NoteSave,
    NoteCreate,
    NoteDelete,
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
    content: String,
    updated_at_unix_ms: u128,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopWorkspace {
    id: String,
    name: String,
    root_path: PathBuf,
    last_opened_at_unix_ms: u128,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRegistry {
    #[serde(default)]
    active_workspace_id: Option<String>,
    workspaces: Vec<DesktopWorkspace>,
}

#[derive(Default)]
struct WorkspaceRegistryMutationLock(tokio::sync::Mutex<()>);

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

impl std::fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CommandError {}

#[tauri::command]
async fn list_workspaces(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
) -> Result<Vec<DesktopWorkspace>, CommandError> {
    let registry = run_locked_workspace_registry_mutation(lock.inner(), || async {
        load_or_create_app_workspace_registry(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_registry_unavailable", error.to_string()))?;

    Ok(registry.workspaces)
}

#[tauri::command]
async fn get_active_workspace(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
) -> Result<DesktopWorkspace, CommandError> {
    let registry = run_locked_workspace_registry_mutation(lock.inner(), || async {
        load_or_create_app_workspace_registry(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_registry_unavailable", error.to_string()))?;

    active_workspace_from_registry(&registry)
        .cloned()
        .map_err(|error| CommandError::new("active_workspace_unavailable", error.to_string()))
}

#[tauri::command]
async fn add_workspace(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    workspace: AddWorkspaceRequest,
) -> Result<DesktopWorkspace, CommandError> {
    let app_data_dir = app_data_dir(&app_handle)
        .map_err(|error| CommandError::new("workspace_add_failed", error.to_string()))?;

    run_locked_workspace_registry_mutation(lock.inner(), || async move {
        add_and_activate_workspace_in_registry(&app_data_dir, &workspace.name, workspace.root_path)
            .await
    })
    .await
    .map_err(|error| CommandError::new("workspace_add_failed", error.to_string()))
}

#[tauri::command]
async fn switch_workspace(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    workspace: WorkspaceIdRequest,
) -> Result<DesktopWorkspace, CommandError> {
    let app_data_dir = app_data_dir(&app_handle)
        .map_err(|error| CommandError::new("workspace_switch_failed", error.to_string()))?;

    run_locked_workspace_registry_mutation(lock.inner(), || async move {
        switch_active_workspace_in_registry(&app_data_dir, &workspace.id).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_switch_failed", error.to_string()))
}

#[tauri::command]
async fn rename_workspace(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    workspace: RenameWorkspaceRequest,
) -> Result<DesktopWorkspace, CommandError> {
    let app_data_dir = app_data_dir(&app_handle)
        .map_err(|error| CommandError::new("workspace_rename_failed", error.to_string()))?;

    run_locked_workspace_registry_mutation(lock.inner(), || async move {
        rename_workspace_in_registry(&app_data_dir, &workspace.id, &workspace.name).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_rename_failed", error.to_string()))
}

#[tauri::command]
async fn remove_workspace(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    workspace: WorkspaceIdRequest,
) -> Result<(), CommandError> {
    let app_data_dir = app_data_dir(&app_handle)
        .map_err(|error| CommandError::new("workspace_remove_failed", error.to_string()))?;

    run_locked_workspace_registry_mutation(lock.inner(), || async move {
        remove_workspace_from_registry(&app_data_dir, &workspace.id).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_remove_failed", error.to_string()))
}

#[tauri::command]
async fn move_markdown_file(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    change: MarkdownPathChange,
) -> Result<(), CommandError> {
    if change.note_id.trim().is_empty() {
        return Err(CommandError::new(
            "invalid_note_id",
            "A note id is required to move a Markdown file.",
        ));
    }

    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_root_unavailable", error.to_string()))?;
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
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
) -> Result<Vec<ScannedMarkdownNote>, CommandError> {
    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))?;

    tokio::fs::create_dir_all(&workspace_root)
        .await
        .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))?;

    scan_markdown_files(&workspace_root)
        .await
        .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))
}

#[tauri::command]
async fn scan_markdown_folders(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
) -> Result<Vec<String>, CommandError> {
    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))?;

    tokio::fs::create_dir_all(&workspace_root)
        .await
        .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))?;

    scan_workspace_folders(&workspace_root)
        .await
        .map_err(|error| CommandError::new("workspace_scan_failed", error.to_string()))
}

#[tauri::command]
async fn read_markdown_note(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    note: ReadMarkdownNoteRequest,
) -> Result<String, CommandError> {
    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("note_read_failed", error.to_string()))?;
    let note_path = resolve_markdown_path(&workspace_root, &note.path)?;

    read_markdown_file(&note_path)
        .await
        .map_err(|error| CommandError::new("note_read_failed", error.to_string()))
}

#[tauri::command]
async fn create_markdown_note(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    note: CreateMarkdownNoteRequest,
) -> Result<ScannedMarkdownNote, CommandError> {
    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("note_create_failed", error.to_string()))?;
    let note_path = resolve_markdown_path(&workspace_root, &note.path)?;

    create_markdown_file(&note_path, note.content.as_bytes())
        .await
        .map_err(|error| CommandError::new("note_create_failed", error.to_string()))?;

    summarize_markdown_file(&workspace_root, &note_path)
        .await
        .map_err(|error| CommandError::new("note_create_failed", error.to_string()))
}

#[tauri::command]
async fn create_markdown_folder(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    folder: CreateMarkdownFolderRequest,
) -> Result<(), CommandError> {
    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("folder_create_failed", error.to_string()))?;
    let folder_path = resolve_folder_path(&workspace_root, &folder.path)?;

    create_workspace_folder(&folder_path)
        .await
        .map_err(|error| CommandError::new("folder_create_failed", error.to_string()))
}

#[tauri::command]
async fn write_markdown_note(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    note: WriteMarkdownNoteRequest,
) -> Result<ScannedMarkdownNote, CommandError> {
    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("note_write_failed", error.to_string()))?;
    let note_path = resolve_markdown_path(&workspace_root, &note.path)?;

    write_markdown_file(&note_path, note.content.as_bytes())
        .await
        .map_err(|error| CommandError::new("note_write_failed", error.to_string()))?;

    summarize_markdown_file(&workspace_root, &note_path)
        .await
        .map_err(|error| CommandError::new("note_write_failed", error.to_string()))
}

#[tauri::command]
async fn delete_markdown_note(
    app_handle: tauri::AppHandle,
    lock: tauri::State<'_, WorkspaceRegistryMutationLock>,
    note: DeleteMarkdownNoteRequest,
) -> Result<(), CommandError> {
    let workspace_root = run_locked_workspace_registry_mutation(lock.inner(), || async {
        active_workspace_root(&app_handle).await
    })
    .await
    .map_err(|error| CommandError::new("note_delete_failed", error.to_string()))?;
    let note_path = resolve_markdown_path(&workspace_root, &note.path)?;

    delete_markdown_file(&note_path)
        .await
        .map_err(|error| CommandError::new("note_delete_failed", error.to_string()))
}

fn main() {
    if let Err(error) = tauri::Builder::default()
        .manage(WorkspaceRegistryMutationLock::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            add_workspace,
            create_markdown_folder,
            create_markdown_note,
            delete_markdown_note,
            get_active_workspace,
            list_workspaces,
            move_markdown_file,
            read_markdown_note,
            refresh_note_indexes,
            remove_workspace,
            rename_workspace,
            scan_markdown_folders,
            scan_markdown_workspace,
            switch_workspace,
            write_markdown_note
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("failed to run Grove desktop app: {error}");
    }
}

async fn run_locked_workspace_registry_mutation<T, F, Fut>(
    lock: &WorkspaceRegistryMutationLock,
    mutation: F,
) -> anyhow::Result<T>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = anyhow::Result<T>>,
{
    let _guard = lock.0.lock().await;

    mutation().await
}

fn app_data_dir(app_handle: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    app_handle
        .path()
        .app_data_dir()
        .context("App data directory is unavailable.")
}

async fn active_workspace_root(app_handle: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    let registry = load_or_create_app_workspace_registry(app_handle).await?;
    let workspace = active_workspace_from_registry(&registry)?;

    tokio::fs::create_dir_all(&workspace.root_path)
        .await
        .with_context(|| {
            format!(
                "Workspace root is unavailable: {}",
                workspace.root_path.display()
            )
        })?;

    Ok(workspace.root_path.clone())
}

async fn load_or_create_app_workspace_registry(
    app_handle: &tauri::AppHandle,
) -> anyhow::Result<WorkspaceRegistry> {
    load_or_create_workspace_registry(&app_data_dir(app_handle)?).await
}

fn workspace_registry_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("workspace-registry.json")
}

async fn load_or_create_workspace_registry(
    app_data_dir: &Path,
) -> anyhow::Result<WorkspaceRegistry> {
    let registry_path = workspace_registry_path(app_data_dir);

    if !tokio::fs::try_exists(&registry_path)
        .await
        .with_context(|| {
            format!(
                "Workspace registry is unavailable: {}",
                registry_path.display()
            )
        })?
    {
        let registry = WorkspaceRegistry {
            active_workspace_id: None,
            workspaces: Vec::new(),
        };
        save_workspace_registry(app_data_dir, &registry).await?;
        return Ok(registry);
    }

    let registry_content = tokio::fs::read_to_string(&registry_path)
        .await
        .with_context(|| {
            format!(
                "Workspace registry is unavailable: {}",
                registry_path.display()
            )
        })?;
    let mut registry: WorkspaceRegistry =
        serde_json::from_str(&registry_content).context("Workspace registry is invalid.")?;

    if registry.workspaces.is_empty() {
        registry.active_workspace_id = None;
        save_workspace_registry(app_data_dir, &registry).await?;
    }

    if !registry.workspaces.is_empty() && find_active_workspace(&registry).is_none() {
        registry.active_workspace_id = Some(registry.workspaces[0].id.clone());
        save_workspace_registry(app_data_dir, &registry).await?;
    }

    Ok(registry)
}

async fn add_and_activate_workspace_in_registry(
    app_data_dir: &Path,
    name: &str,
    root_path: PathBuf,
) -> anyhow::Result<DesktopWorkspace> {
    let mut registry = load_or_create_workspace_registry(app_data_dir).await?;
    let name = validate_workspace_name(name)?;
    let root_path = validate_workspace_root_path(root_path)?;

    if workspace_root_is_registered(&registry, &root_path).await? {
        bail!("That workspace root is already registered.");
    }

    let root_path = prepare_workspace_root(root_path).await?;

    let workspace = DesktopWorkspace {
        id: create_workspace_id(&name, &registry.workspaces),
        name,
        root_path,
        last_opened_at_unix_ms: current_unix_ms()?,
    };
    registry.active_workspace_id = Some(workspace.id.clone());
    registry.workspaces.push(workspace.clone());
    save_workspace_registry(app_data_dir, &registry).await?;

    Ok(workspace)
}

async fn switch_active_workspace_in_registry(
    app_data_dir: &Path,
    workspace_id: &str,
) -> anyhow::Result<DesktopWorkspace> {
    let mut registry = load_or_create_workspace_registry(app_data_dir).await?;
    let workspace_index = find_workspace_index(&registry, workspace_id)?;
    registry.active_workspace_id = Some(workspace_id.to_string());
    registry.workspaces[workspace_index].last_opened_at_unix_ms = current_unix_ms()?;
    let workspace = registry.workspaces[workspace_index].clone();
    tokio::fs::create_dir_all(&workspace.root_path)
        .await
        .with_context(|| {
            format!(
                "Workspace root is unavailable: {}",
                workspace.root_path.display()
            )
        })?;
    save_workspace_registry(app_data_dir, &registry).await?;

    Ok(workspace)
}

async fn rename_workspace_in_registry(
    app_data_dir: &Path,
    workspace_id: &str,
    name: &str,
) -> anyhow::Result<DesktopWorkspace> {
    let mut registry = load_or_create_workspace_registry(app_data_dir).await?;
    let workspace_index = find_workspace_index(&registry, workspace_id)?;
    registry.workspaces[workspace_index].name = validate_workspace_name(name)?;
    let workspace = registry.workspaces[workspace_index].clone();
    save_workspace_registry(app_data_dir, &registry).await?;

    Ok(workspace)
}

async fn remove_workspace_from_registry(
    app_data_dir: &Path,
    workspace_id: &str,
) -> anyhow::Result<()> {
    let mut registry = load_or_create_workspace_registry(app_data_dir).await?;
    find_workspace_index(&registry, workspace_id)?;
    registry
        .workspaces
        .retain(|workspace| workspace.id != workspace_id);

    if registry.workspaces.is_empty() {
        registry.active_workspace_id = None;
    } else if registry.active_workspace_id.as_deref() == Some(workspace_id) {
        let active_workspace_id = registry
            .workspaces
            .iter()
            .max_by_key(|workspace| workspace.last_opened_at_unix_ms)
            .map(|workspace| workspace.id.clone())
            .context("The active workspace is unavailable.")?;
        registry.active_workspace_id = Some(active_workspace_id);
    }

    save_workspace_registry(app_data_dir, &registry).await
}

async fn save_workspace_registry(
    app_data_dir: &Path,
    registry: &WorkspaceRegistry,
) -> anyhow::Result<()> {
    tokio::fs::create_dir_all(app_data_dir)
        .await
        .with_context(|| {
            format!(
                "Workspace registry directory is unavailable: {}",
                app_data_dir.display()
            )
        })?;

    let registry_path = workspace_registry_path(app_data_dir);
    let registry_json = serde_json::to_vec_pretty(registry)
        .context("Workspace registry could not be serialized.")?;
    let temporary_path = registry_path.with_extension("json.tmp");

    tokio::fs::write(&temporary_path, registry_json)
        .await
        .with_context(|| {
            format!(
                "Workspace registry temporary file is unavailable: {}",
                temporary_path.display()
            )
        })?;
    replace_file_with_temporary_path(&temporary_path, &registry_path)
        .await
        .with_context(|| {
            format!(
                "Workspace registry file is unavailable: {}",
                registry_path.display()
            )
        })
}

fn validate_workspace_root_path(root_path: PathBuf) -> anyhow::Result<PathBuf> {
    if root_path.as_os_str().is_empty() || !root_path.is_absolute() {
        bail!("Workspace roots must be absolute paths.");
    }

    Ok(lexically_normalize_path(&root_path))
}

fn lexically_normalize_path(path: &Path) -> PathBuf {
    let mut normalized_path = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized_path.push(prefix.as_os_str()),
            Component::RootDir => normalized_path.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = normalized_path.pop();
            }
            Component::Normal(segment) => normalized_path.push(segment),
        }
    }

    normalized_path
}

async fn prepare_workspace_root(root_path: PathBuf) -> anyhow::Result<PathBuf> {
    if tokio::fs::try_exists(&root_path)
        .await
        .with_context(|| format!("Workspace root cannot be checked: {}", root_path.display()))?
        && !tokio::fs::metadata(&root_path)
            .await
            .with_context(|| {
                format!(
                    "Workspace root metadata is unavailable: {}",
                    root_path.display()
                )
            })?
            .is_dir()
    {
        bail!("Workspace roots must point to a directory.");
    }

    tokio::fs::create_dir_all(&root_path)
        .await
        .with_context(|| {
            format!(
                "Workspace root could not be created: {}",
                root_path.display()
            )
        })?;

    tokio::fs::canonicalize(&root_path).await.with_context(|| {
        format!(
            "Workspace root could not be resolved: {}",
            root_path.display()
        )
    })
}

async fn workspace_root_is_registered(
    registry: &WorkspaceRegistry,
    root_path: &Path,
) -> anyhow::Result<bool> {
    let canonical_root_path = canonicalize_existing_path(root_path).await?;

    for workspace in &registry.workspaces {
        if workspace.root_path == root_path {
            return Ok(true);
        }

        if canonical_root_path
            .as_ref()
            .is_some_and(|path| path == &workspace.root_path)
        {
            return Ok(true);
        }

        if let Some(canonical_registered_root_path) =
            canonicalize_existing_path(&workspace.root_path).await?
        {
            if Some(&canonical_registered_root_path) == canonical_root_path.as_ref() {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

async fn canonicalize_existing_path(path: &Path) -> anyhow::Result<Option<PathBuf>> {
    if !tokio::fs::try_exists(path)
        .await
        .with_context(|| format!("Workspace root cannot be checked: {}", path.display()))?
    {
        return Ok(None);
    }

    tokio::fs::canonicalize(path)
        .await
        .map(Some)
        .with_context(|| format!("Workspace root could not be resolved: {}", path.display()))
}

fn validate_workspace_name(name: &str) -> anyhow::Result<String> {
    let name = name.trim();

    if name.is_empty() {
        bail!("A workspace name is required.");
    }

    Ok(name.to_string())
}

fn find_workspace_index(registry: &WorkspaceRegistry, workspace_id: &str) -> anyhow::Result<usize> {
    registry
        .workspaces
        .iter()
        .position(|workspace| workspace.id == workspace_id)
        .context("The requested workspace is not registered.")
}

fn find_active_workspace(registry: &WorkspaceRegistry) -> Option<&DesktopWorkspace> {
    let active_workspace_id = registry.active_workspace_id.as_deref()?;

    registry
        .workspaces
        .iter()
        .find(|workspace| workspace.id == active_workspace_id)
}

fn active_workspace_from_registry(
    registry: &WorkspaceRegistry,
) -> anyhow::Result<&DesktopWorkspace> {
    find_active_workspace(registry).context("The active workspace is unavailable.")
}

fn create_workspace_id(name: &str, workspaces: &[DesktopWorkspace]) -> String {
    let base_id = slugify_workspace_name(name);
    let mut candidate = base_id.clone();
    let mut suffix = 2;

    while workspaces.iter().any(|workspace| workspace.id == candidate) {
        candidate = format!("{base_id}-{suffix}");
        suffix += 1;
    }

    candidate
}

fn slugify_workspace_name(name: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_separator = false;

    for character in name.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            previous_was_separator = false;
            continue;
        }

        if !slug.is_empty() && !previous_was_separator {
            slug.push('-');
            previous_was_separator = true;
        }
    }

    let slug = slug.trim_matches('-');

    if slug.is_empty() {
        return "workspace".to_string();
    }

    slug.to_string()
}

fn current_unix_ms() -> anyhow::Result<u128> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .context("System time is unavailable.")
}

fn resolve_markdown_path(workspace_root: &Path, path: &str) -> Result<PathBuf, CommandError> {
    validate_markdown_path(path)?;
    Ok(workspace_root.join(path))
}

fn resolve_folder_path(workspace_root: &Path, path: &str) -> Result<PathBuf, CommandError> {
    validate_folder_path(path)?;
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

fn validate_folder_path(path: &str) -> Result<(), CommandError> {
    if has_windows_drive_prefix(path) {
        return Err(CommandError::new(
            "invalid_folder_path",
            "Folder paths must not include a drive prefix.",
        ));
    }

    if path.contains('\\') {
        return Err(CommandError::new(
            "invalid_folder_path",
            "Folder paths must use workspace separators.",
        ));
    }

    let folder_path = Path::new(path);

    if folder_path.components().next().is_none() {
        return Err(CommandError::new(
            "invalid_folder_path",
            "Folder paths cannot be empty.",
        ));
    }

    for component in folder_path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(CommandError::new(
                "invalid_folder_path",
                "Folder paths must stay inside the workspace.",
            ));
        }
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

async fn scan_workspace_folders(workspace_root: &Path) -> anyhow::Result<Vec<String>> {
    let mut pending_dirs = vec![workspace_root.to_path_buf()];
    let mut folders = Vec::new();

    while let Some(directory) = pending_dirs.pop() {
        let mut entries = tokio::fs::read_dir(&directory).await?;

        while let Some(entry) = entries.next_entry().await? {
            let file_name = entry.file_name();
            let file_name = file_name.to_string_lossy();

            if file_name.starts_with('.') {
                continue;
            }

            if entry.file_type().await?.is_dir() {
                pending_dirs.push(entry.path());
            }
        }

        if directory != workspace_root {
            let relative_path = directory.strip_prefix(workspace_root)?;
            folders.push(relative_path_to_workspace_path(relative_path)?);
        }
    }

    folders.sort_by_key(|path| path.to_lowercase());
    Ok(folders)
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

    let temporary_path = get_temporary_write_path(path)?;
    let write_result = async {
        let mut file = tokio::fs::File::create(&temporary_path).await?;
        file.write_all(content).await?;
        file.flush().await?;
        file.sync_all().await?;
        drop(file);

        replace_file_with_temporary_path(&temporary_path, path).await
    }
    .await;

    if write_result.is_err() {
        let _ = tokio::fs::remove_file(&temporary_path).await;
    }

    write_result
}

async fn delete_markdown_file(path: &Path) -> anyhow::Result<()> {
    tokio::fs::remove_file(path).await?;
    Ok(())
}

async fn create_markdown_file(path: &Path, content: &[u8]) -> anyhow::Result<()> {
    if let Some(parent_path) = path.parent() {
        tokio::fs::create_dir_all(parent_path).await?;
    }

    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                anyhow::anyhow!(
                    "The target Markdown file already exists: {}",
                    path.display()
                )
            } else {
                error.into()
            }
        })?;

    let write_result = async {
        file.write_all(content).await?;
        file.flush().await?;
        file.sync_all().await?;
        anyhow::Ok(())
    }
    .await;

    if write_result.is_err() {
        drop(file);
        let _ = tokio::fs::remove_file(path).await;
    }

    write_result
}

async fn create_workspace_folder(path: &Path) -> anyhow::Result<()> {
    if tokio::fs::try_exists(path).await? {
        anyhow::bail!("The target folder already exists: {}", path.display());
    }

    if let Some(parent_path) = path.parent() {
        tokio::fs::create_dir_all(parent_path).await?;
    }

    tokio::fs::create_dir(path).await?;
    Ok(())
}

fn get_temporary_write_path(path: &Path) -> anyhow::Result<PathBuf> {
    let file_name = path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .ok_or_else(|| anyhow::anyhow!("Markdown file paths must include a file name."))?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let temporary_file_name = format!(".{file_name}.{}.{}.tmp", std::process::id(), timestamp);

    Ok(path.with_file_name(temporary_file_name))
}

#[cfg(not(windows))]
async fn replace_file_with_temporary_path(
    temporary_path: &Path,
    path: &Path,
) -> anyhow::Result<()> {
    tokio::fs::rename(temporary_path, path).await?;
    Ok(())
}

#[cfg(windows)]
async fn replace_file_with_temporary_path(
    temporary_path: &Path,
    path: &Path,
) -> anyhow::Result<()> {
    replace_file_with_backup_on_windows(temporary_path, path).await
}

#[cfg(windows)]
async fn replace_file_with_backup_on_windows(
    temporary_path: &Path,
    path: &Path,
) -> anyhow::Result<()> {
    if !tokio::fs::try_exists(path).await? {
        tokio::fs::rename(temporary_path, path).await?;
        return Ok(());
    }

    if !tokio::fs::metadata(path).await?.is_file() {
        anyhow::bail!("The target Markdown path is not a file: {}", path.display());
    }

    let backup_path = get_temporary_write_path(path)?.with_extension("backup");
    tokio::fs::rename(path, &backup_path).await?;

    match tokio::fs::rename(temporary_path, path).await {
        Ok(()) => {
            let _ = tokio::fs::remove_file(&backup_path).await;
            Ok(())
        }
        Err(error) => {
            let _ = tokio::fs::rename(&backup_path, path).await;
            Err(error.into())
        }
    }
}

async fn summarize_markdown_file(
    workspace_root: &Path,
    markdown_path: &Path,
) -> anyhow::Result<ScannedMarkdownNote> {
    let relative_path = get_workspace_relative_markdown_path(workspace_root, markdown_path)?;
    let metadata = tokio::fs::metadata(markdown_path).await?;
    let updated_at_unix_ms = system_time_to_unix_ms(metadata.modified()?);
    let content = read_markdown_file(markdown_path).await?;
    let fallback_title = markdown_path
        .file_stem()
        .and_then(|file_stem| file_stem.to_str())
        .unwrap_or("Untitled")
        .trim()
        .to_string();
    let title = derive_markdown_title(&content, &fallback_title);

    Ok(ScannedMarkdownNote {
        path: relative_path,
        title,
        content,
        updated_at_unix_ms,
    })
}

fn derive_markdown_title(content: &str, fallback_title: &str) -> String {
    find_frontmatter_title(content)
        .or_else(|| find_first_markdown_heading(content))
        .unwrap_or_else(|| fallback_title.to_string())
}

fn find_frontmatter_title(content: &str) -> Option<String> {
    let normalized_content = content.strip_prefix('\u{feff}').unwrap_or(content);
    let mut lines = normalized_content.lines();

    if lines.next()?.trim() != "---" {
        return None;
    }

    for line in lines {
        let trimmed_line = line.trim();

        if matches!(trimmed_line, "---" | "...") {
            return None;
        }

        let Some((key, raw_value)) = trimmed_line.split_once(':') else {
            continue;
        };

        if !key.trim().eq_ignore_ascii_case("title") {
            continue;
        }

        let title = strip_wrapping_quotes(raw_value.trim()).trim();

        if !title.is_empty() {
            return Some(title.to_string());
        }
    }

    None
}

fn find_first_markdown_heading(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed_line = line.trim_start();

        if !trimmed_line.starts_with("# ") {
            continue;
        }

        let title = strip_closing_heading_marker(trimmed_line[2..].trim());

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

fn strip_wrapping_quotes(value: &str) -> &str {
    let bytes = value.as_bytes();

    if bytes.len() >= 2
        && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
    {
        return value[1..value.len() - 1].trim();
    }

    value
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
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use super::{
        add_and_activate_workspace_in_registry, create_markdown_file, create_workspace_folder,
        delete_markdown_file, derive_markdown_title, find_first_markdown_heading,
        get_temporary_write_path, get_workspace_relative_markdown_path,
        load_or_create_workspace_registry, move_file_without_overwrite, read_markdown_file,
        remove_workspace_from_registry, rename_workspace_in_registry,
        run_locked_workspace_registry_mutation, scan_markdown_files, scan_workspace_folders,
        system_time_to_unix_ms, validate_markdown_path, write_markdown_file,
        WorkspaceRegistryMutationLock,
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
    fn creates_an_empty_workspace_registry_on_first_run() {
        run_async(async {
            let app_data_dir = unique_test_dir("creates-empty-workspace-registry");

            let registry = load_or_create_workspace_registry(&app_data_dir).await?;
            let registry_content =
                tokio::fs::read_to_string(app_data_dir.join("workspace-registry.json")).await?;
            let registry_json: serde_json::Value = serde_json::from_str(&registry_content)?;

            assert!(registry.workspaces.is_empty());
            assert!(registry_json["activeWorkspaceId"].is_null());
            assert!(tokio::fs::try_exists(app_data_dir.join("workspace-registry.json")).await?);
            assert!(
                !tokio::fs::try_exists(app_data_dir.join("workspaces").join("default")).await?
            );
            tokio::fs::remove_dir_all(&app_data_dir).await?;
            anyhow::Ok(())
        })
        .expect("empty workspace registry should be created");
    }

    #[test]
    fn adding_workspace_persists_it_and_makes_it_active() {
        run_async(async {
            let app_data_dir = unique_test_dir("persists-added-workspace");
            let workspace_root = unique_test_dir("external-workspace-root");
            tokio::fs::create_dir_all(&workspace_root).await?;
            load_or_create_workspace_registry(&app_data_dir).await?;
            let canonical_workspace_root = tokio::fs::canonicalize(&workspace_root).await?;

            let added_workspace = add_and_activate_workspace_in_registry(
                &app_data_dir,
                "Research",
                workspace_root.clone(),
            )
            .await?;
            let registry = load_or_create_workspace_registry(&app_data_dir).await?;

            assert_eq!(registry.active_workspace_id, Some(added_workspace.id));
            assert!(registry
                .workspaces
                .iter()
                .any(|workspace| workspace.name == "Research"
                    && workspace.root_path == canonical_workspace_root));
            tokio::fs::remove_dir_all(&app_data_dir).await?;
            tokio::fs::remove_dir_all(&workspace_root).await?;
            anyhow::Ok(())
        })
        .expect("added workspace should persist and become switchable");
    }

    #[test]
    fn renames_and_removes_workspaces_without_deleting_markdown_files() {
        run_async(async {
            let app_data_dir = unique_test_dir("renames-and-removes-workspace");
            let workspace_root = unique_test_dir("workspace-to-remove");
            let note_path = workspace_root.join("Plan.md");
            tokio::fs::create_dir_all(&workspace_root).await?;
            tokio::fs::write(&note_path, "# Plan").await?;
            load_or_create_workspace_registry(&app_data_dir).await?;
            let added_workspace = add_and_activate_workspace_in_registry(
                &app_data_dir,
                "Research",
                workspace_root.clone(),
            )
            .await?;

            rename_workspace_in_registry(&app_data_dir, &added_workspace.id, "Archive").await?;
            remove_workspace_from_registry(&app_data_dir, &added_workspace.id).await?;
            let registry = load_or_create_workspace_registry(&app_data_dir).await?;

            assert!(!registry
                .workspaces
                .iter()
                .any(|workspace| workspace.id == added_workspace.id));
            assert!(tokio::fs::try_exists(&note_path).await?);
            tokio::fs::remove_dir_all(&app_data_dir).await?;
            tokio::fs::remove_dir_all(&workspace_root).await?;
            anyhow::Ok(())
        })
        .expect("workspace metadata removal should preserve files");
    }

    #[test]
    fn leaves_no_active_workspace_after_removing_the_last_workspace() {
        run_async(async {
            let app_data_dir = unique_test_dir("removes-last-workspace");
            let workspace_root = unique_test_dir("last-workspace-root");
            tokio::fs::create_dir_all(&workspace_root).await?;
            load_or_create_workspace_registry(&app_data_dir).await?;
            let added_workspace = add_and_activate_workspace_in_registry(
                &app_data_dir,
                "Research",
                workspace_root.clone(),
            )
            .await?;

            remove_workspace_from_registry(&app_data_dir, &added_workspace.id).await?;
            let registry = load_or_create_workspace_registry(&app_data_dir).await?;
            let registry_content =
                tokio::fs::read_to_string(app_data_dir.join("workspace-registry.json")).await?;
            let registry_json: serde_json::Value = serde_json::from_str(&registry_content)?;

            assert!(registry.workspaces.is_empty());
            assert!(registry_json["activeWorkspaceId"].is_null());
            tokio::fs::remove_dir_all(&app_data_dir).await?;
            tokio::fs::remove_dir_all(&workspace_root).await?;
            anyhow::Ok(())
        })
        .expect("last workspace removal should leave no active workspace");
    }

    #[test]
    fn rejects_invalid_workspace_roots() {
        run_async(async {
            let app_data_dir = unique_test_dir("rejects-invalid-workspace-roots");
            load_or_create_workspace_registry(&app_data_dir).await?;

            let error = add_and_activate_workspace_in_registry(
                &app_data_dir,
                "Relative",
                PathBuf::from("Notes"),
            )
            .await
            .expect_err("relative workspace roots should be rejected");

            assert!(error.to_string().contains("absolute paths"));
            tokio::fs::remove_dir_all(&app_data_dir).await?;
            anyhow::Ok(())
        })
        .expect("invalid workspace root test should run");
    }

    #[test]
    fn rejects_duplicate_workspace_roots_without_creating_new_directories() {
        run_async(async {
            let app_data_dir = unique_test_dir("rejects-duplicate-without-creating");
            let workspace_root = unique_test_dir("existing-workspace-root");
            let duplicate_child = workspace_root.join("CreatedByRejectedAdd");
            let duplicate_root = duplicate_child.join("..");
            tokio::fs::create_dir_all(&workspace_root).await?;
            load_or_create_workspace_registry(&app_data_dir).await?;
            add_and_activate_workspace_in_registry(
                &app_data_dir,
                "Research",
                workspace_root.clone(),
            )
            .await?;

            let error = add_and_activate_workspace_in_registry(
                &app_data_dir,
                "Duplicate Research",
                duplicate_root,
            )
            .await
            .expect_err("duplicate workspace roots should be rejected");

            assert!(error.to_string().contains("already registered"));
            assert!(!tokio::fs::try_exists(&duplicate_child).await?);
            tokio::fs::remove_dir_all(&app_data_dir).await?;
            tokio::fs::remove_dir_all(&workspace_root).await?;
            anyhow::Ok(())
        })
        .expect("duplicate workspace root test should run");
    }

    #[test]
    fn canonicalizes_workspace_roots_before_persisting() {
        run_async(async {
            let app_data_dir = unique_test_dir("canonicalizes-workspace-root");
            let workspace_root = unique_test_dir("canonical-workspace-root");
            let nested_root = workspace_root.join("Nested");
            let noncanonical_root = nested_root.join("..").join("Nested");
            tokio::fs::create_dir_all(&nested_root).await?;
            load_or_create_workspace_registry(&app_data_dir).await?;

            let added_workspace = add_and_activate_workspace_in_registry(
                &app_data_dir,
                "Research",
                noncanonical_root,
            )
            .await?;

            assert_eq!(
                added_workspace.root_path,
                tokio::fs::canonicalize(&nested_root).await?
            );
            tokio::fs::remove_dir_all(&app_data_dir).await?;
            tokio::fs::remove_dir_all(&workspace_root).await?;
            anyhow::Ok(())
        })
        .expect("workspace root should be canonicalized");
    }

    #[test]
    fn serializes_workspace_registry_mutations() {
        run_async(async {
            let lock = WorkspaceRegistryMutationLock::default();
            let active_mutations = Arc::new(AtomicUsize::new(0));
            let max_active_mutations = Arc::new(AtomicUsize::new(0));

            let lock = Arc::new(lock);
            let first_lock = Arc::clone(&lock);
            let second_lock = Arc::clone(&lock);
            let first_active_mutations = Arc::clone(&active_mutations);
            let first_max_active_mutations = Arc::clone(&max_active_mutations);
            let second_active_mutations = Arc::clone(&active_mutations);
            let second_max_active_mutations = Arc::clone(&max_active_mutations);

            let first_mutation = tokio::spawn(async move {
                run_locked_workspace_registry_mutation(&first_lock, || {
                    let active_mutations = Arc::clone(&first_active_mutations);
                    let max_active_mutations = Arc::clone(&first_max_active_mutations);
                    async move {
                        let active = active_mutations.fetch_add(1, Ordering::SeqCst) + 1;
                        max_active_mutations.fetch_max(active, Ordering::SeqCst);
                        tokio::task::yield_now().await;
                        active_mutations.fetch_sub(1, Ordering::SeqCst);
                        anyhow::Ok(())
                    }
                })
                .await
            });
            let second_mutation = tokio::spawn(async move {
                let active_mutations = Arc::clone(&second_active_mutations);
                let max_active_mutations = Arc::clone(&second_max_active_mutations);
                run_locked_workspace_registry_mutation(&second_lock, || async move {
                    let active = active_mutations.fetch_add(1, Ordering::SeqCst) + 1;
                    max_active_mutations.fetch_max(active, Ordering::SeqCst);
                    tokio::task::yield_now().await;
                    active_mutations.fetch_sub(1, Ordering::SeqCst);
                    anyhow::Ok(())
                })
                .await
            });

            first_mutation.await??;
            second_mutation.await??;
            assert_eq!(max_active_mutations.load(Ordering::SeqCst), 1);
            anyhow::Ok(())
        })
        .expect("registry mutations should be serialized");
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
        let title = find_first_markdown_heading("#tag\n\n# Project plan ##\nbody")
            .expect("heading should be found");

        assert_eq!(title, "Project plan");
    }

    #[test]
    fn keeps_hash_characters_that_are_part_of_the_heading_title() {
        let title = find_first_markdown_heading("# C#").expect("heading should be found");

        assert_eq!(title, "C#");
    }

    #[test]
    fn derives_title_from_frontmatter_before_heading() {
        assert_eq!(
            derive_markdown_title("---\ntitle: \"Roadmap\"\n---\n# Plan", "Plan"),
            "Roadmap"
        );
    }

    #[test]
    fn derives_title_from_first_h1_before_the_file_stem() {
        assert_eq!(
            derive_markdown_title("## Context\n# Plan ###", "Fallback"),
            "Plan"
        );
    }

    #[test]
    fn falls_back_to_the_file_stem_when_content_has_no_explicit_title() {
        assert_eq!(derive_markdown_title("Body", "Daily Plan"), "Daily Plan");
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
            assert_eq!(notes[0].content, "no heading");
            assert_eq!(notes[1].path, "Projects/Plan.md");
            assert_eq!(notes[1].title, "Plan");
            assert_eq!(notes[1].content, "# Plan\nbody");
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("workspace scan should succeed");
    }

    #[test]
    fn scans_empty_workspace_folders_and_ignores_hidden_directories() {
        run_async(async {
            let workspace_dir = unique_test_dir("scans-empty-workspace-folders");
            let empty_folder_path = workspace_dir.join("Projects").join("Ideas");
            let hidden_folder_path = workspace_dir.join(".obsidian");
            let note_path = workspace_dir.join("Projects").join("Plan.md");
            tokio::fs::create_dir_all(&empty_folder_path).await?;
            tokio::fs::create_dir_all(&hidden_folder_path).await?;
            tokio::fs::write(&note_path, "# Plan").await?;

            let folders = scan_workspace_folders(&workspace_dir).await?;

            assert_eq!(folders, vec!["Projects", "Projects/Ideas"]);
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("workspace folder scan should succeed");
    }

    #[test]
    fn scans_folders_that_only_contain_non_markdown_files() {
        run_async(async {
            let workspace_dir = unique_test_dir("scans-asset-only-folders");
            let asset_folder_path = workspace_dir.join("Projects").join("Assets");
            let asset_path = asset_folder_path.join("logo.png");
            tokio::fs::create_dir_all(&asset_folder_path).await?;
            tokio::fs::write(&asset_path, "png").await?;

            let folders = scan_workspace_folders(&workspace_dir).await?;

            assert_eq!(folders, vec!["Projects", "Projects/Assets"]);
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("asset-only folder scan should succeed");
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
    fn deletes_markdown_files() {
        run_async(async {
            let workspace_dir = unique_test_dir("deletes-markdown-files");
            let note_path = workspace_dir.join("Projects").join("Plan.md");
            tokio::fs::create_dir_all(note_path.parent().expect("note parent")).await?;
            tokio::fs::write(&note_path, "# Plan").await?;

            delete_markdown_file(&note_path).await?;

            assert!(!tokio::fs::try_exists(&note_path).await?);
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("Markdown delete should succeed");
    }

    #[test]
    fn creates_new_markdown_files_without_overwriting_existing_paths() {
        run_async(async {
            let workspace_dir = unique_test_dir("creates-new-markdown-files");
            let note_path = workspace_dir.join("Projects").join("Plan.md");

            create_markdown_file(&note_path, b"").await?;

            assert_eq!(tokio::fs::read_to_string(&note_path).await?, "");
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("Markdown create should succeed");
    }

    #[test]
    fn rejects_new_markdown_files_when_the_target_exists() {
        run_async(async {
            let workspace_dir = unique_test_dir("rejects-existing-create-target");
            let note_path = workspace_dir.join("Projects").join("Plan.md");
            tokio::fs::create_dir_all(note_path.parent().expect("note parent")).await?;
            tokio::fs::write(&note_path, "# Plan").await?;

            let error = create_markdown_file(&note_path, b"")
                .await
                .expect_err("existing create target should be rejected");

            assert!(error.to_string().contains("already exists"));
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("Markdown create collision test should run");
    }

    #[test]
    fn creates_new_workspace_folders_without_overwriting_existing_paths() {
        run_async(async {
            let workspace_dir = unique_test_dir("creates-new-workspace-folders");
            let folder_path = workspace_dir.join("Projects").join("Ideas");

            create_workspace_folder(&folder_path).await?;

            assert!(tokio::fs::try_exists(&folder_path).await?);
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("workspace folder create should succeed");
    }

    #[test]
    fn rejects_new_workspace_folders_when_the_target_exists() {
        run_async(async {
            let workspace_dir = unique_test_dir("rejects-existing-folder-create-target");
            let folder_path = workspace_dir.join("Projects").join("Ideas");
            tokio::fs::create_dir_all(&folder_path).await?;

            let error = create_workspace_folder(&folder_path)
                .await
                .expect_err("existing folder target should be rejected");

            assert!(error.to_string().contains("already exists"));
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("workspace folder create collision test should run");
    }

    #[test]
    fn overwrites_existing_markdown_file_content() {
        run_async(async {
            let workspace_dir = unique_test_dir("overwrites-existing-markdown-file-content");
            let note_path = workspace_dir.join("Projects").join("Plan.md");

            write_markdown_file(&note_path, b"# Plan\n\nDraft").await?;
            write_markdown_file(&note_path, b"# Plan\n\nSaved").await?;

            assert_eq!(
                tokio::fs::read_to_string(&note_path).await?,
                "# Plan\n\nSaved"
            );
            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("Markdown overwrite should succeed");
    }

    #[test]
    fn creates_temporary_write_paths_next_to_markdown_files() {
        let note_path = PathBuf::from("Projects").join("Plan.md");
        let temporary_path =
            get_temporary_write_path(&note_path).expect("Temporary path should build");

        assert_eq!(temporary_path.parent(), note_path.parent());
        assert!(temporary_path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .is_some_and(|file_name| file_name.starts_with(".Plan.md.")));
    }

    #[test]
    fn removes_temporary_file_when_markdown_write_fails() {
        run_async(async {
            let workspace_dir = unique_test_dir("removes-temporary-file-when-write-fails");
            let note_path = workspace_dir.join("Projects").join("Plan.md");
            tokio::fs::create_dir_all(&note_path).await?;

            let error = write_markdown_file(&note_path, b"# Plan")
                .await
                .expect_err("directory targets should reject file writes");
            assert!(error.to_string().contains("directory"));

            let mut entries = tokio::fs::read_dir(note_path.parent().expect("note parent")).await?;
            while let Some(entry) = entries.next_entry().await? {
                let file_name = entry.file_name();
                let file_name = file_name.to_string_lossy();
                assert!(!file_name.starts_with(".Plan.md."));
            }

            tokio::fs::remove_dir_all(&workspace_dir).await?;
            anyhow::Ok(())
        })
        .expect("temporary cleanup test should run");
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
