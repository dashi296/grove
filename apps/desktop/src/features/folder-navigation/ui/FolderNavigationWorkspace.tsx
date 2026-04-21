import {
  appName,
  buildFolderTree,
  compareWorkspacePaths,
  getFolderDisplayName,
  getFolderPathForNote,
  isNoteInFolderScope,
  normalizeFolderPath,
  normalizeFolderScope,
  resolveWikiLinks,
} from "@grove/core";
import type { FolderScope, FolderTreeNode, ResolvedWikiLink } from "@grove/core";
import type { MarkdownCommand, MarkdownSelection } from "@grove/editor";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { DesktopWorkspace } from "../../../shared";
import { getRecentWorkspaces, useWorkspaceStore } from "../model/useWorkspaceStore";

import {
  createMarkdownNote,
  deleteMarkdownNote,
  moveMarkdownFile,
  readMarkdownNote,
  refreshNoteIndexes,
  scanMarkdownWorkspace,
  writeMarkdownNote,
} from "../../../shared";
import {
  deleteSelectedNoteFromFolderWorkspace,
  getFailedOperationSteps,
  getNextPendingOperationStep,
  isDescendantFolderPath,
  isPathChangeOperationComplete,
  moveNoteInFolderWorkspace,
  reconcileFolderWorkspaceState,
  renameFolderInWorkspace,
} from "../model/folderWorkspaceState";
import { createDesktopPathChangeExecutor } from "../model/folderPathChangeExecutor";
import { dispatchMarkdownEditorCommand } from "../model/markdownEditor";
import { createNewNotePath } from "../model/noteCreation";
import {
  canSaveNoteEditBuffer,
  createCleanNoteEditBuffer,
  createErroredNoteEditBuffer,
  discardNoteEditDraft,
  isNoteEditBufferBlockingWorkspaceChange,
  markNoteEditBufferSaved,
  markNoteEditBufferSaveFailed,
  markNoteEditBufferSaving,
  updateNoteEditBufferPath,
  updateNoteEditDraft,
} from "../model/noteEditBuffer";
import {
  applySavedNoteMetadataToWorkspaceState,
  isNoteAffectedByPathChange,
  isNoteSaveBlockedByPathChange,
  isNoteSaveKeyboardShortcut,
} from "../model/noteSave";
import { usePathChangeQueue } from "../model/usePathChangeQueue";
import { mapScannedMarkdownNotes } from "../model/workspaceScan";
import type {
  FolderNavigationNote,
  FolderWorkspaceMutation,
  FolderWorkspaceOperationStepId,
  FolderWorkspaceOperationStep,
  FolderWorkspacePathChange,
  FolderWorkspacePathChangeOperation,
  FolderWorkspaceState,
} from "../model/folderWorkspaceState";
import type { NoteEditBuffer } from "../model/noteEditBuffer";
import "./FolderNavigationWorkspace.css";

type NoteListItem = FolderNavigationNote;

type FolderNodeProps = {
  node: FolderTreeNode;
  selectedFolderPath: FolderScope;
  expandedFolderPaths: readonly string[];
  onSelect: (path: FolderScope) => void;
  onToggle: (path: string) => void;
};

type WorkspaceSwitcherSlice = {
  activeWorkspaceName: string;
  recentWorkspaces: readonly DesktopWorkspace[];
  switchBlockedReason: string | null;
  onSwitchWorkspace: (id: string) => Promise<void>;
  onAddWorkspace: (name: string, rootPath: string) => Promise<void>;
  onRenameWorkspace: (name: string) => Promise<void>;
  onRemoveWorkspace: () => Promise<void>;
};

type SidebarProps = {
  noteCount: number;
  folderTree: readonly FolderTreeNode[];
  selectedFolderPath: FolderScope;
  expandedFolderPaths: readonly string[];
  onSelect: (path: FolderScope) => void;
  onToggle: (path: string) => void;
} & WorkspaceSwitcherSlice;

type NoteListProps = {
  selectedFolderPath: FolderScope;
  scopedNotes: readonly NoteListItem[];
  selectedNoteId: string;
  scanState: WorkspaceScanState;
  createState: NoteCreateState;
  createTitle: string;
  onCreateTitleChange: (title: string) => void;
  onCreateNote: () => void;
  onSelectNote: (noteId: string) => void;
};

type NavigationPaneProps = SidebarProps & NoteListProps;

type WorkspaceSwitcherProps = WorkspaceSwitcherSlice & {
  initiallyOpen?: boolean;
};

type PopoverView = "list" | "add" | "settings";

type PopoverOperationState = {
  status: "idle" | "pending" | "failed";
  errorMessage: string | null;
};

type WorkspaceSwitcherPopoverProps = WorkspaceSwitcherSlice & {
  id: string;
};

type FolderOption = {
  path: FolderScope;
  label: string;
};

type ActivePaneProps = {
  notes: readonly NoteListItem[];
  folderOptions: readonly FolderOption[];
  selectedFolderPath: FolderScope;
  selectedNoteId: string;
  noteEditBuffer: NoteEditBuffer | null;
  editorLoadState: NoteEditorLoadState;
  editorNotice: string | null;
  deleteState: NoteDeleteState;
  onMoveSelectedNote: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
  onRenameSelectedFolder: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
  onEditContent: (content: string) => void;
  onSaveDraft: () => void;
  saveBlockedReason: string | null;
  onDiscardDraft: () => void;
  deleteBlockedReason: string | null;
  onDeleteSelectedNote: () => void;
  isDevelopmentMode: boolean;
  isPathChangeQueueVisible: boolean;
  onTogglePathChangeQueue: () => void;
  pathChangeOperations: readonly FolderWorkspacePathChangeOperation[];
  runningOperationIds: readonly string[];
  onClearCompletedOperations: () => void;
  onRunNextStep: (operationId: string) => void;
  onRetryStep: (operationId: string, stepId: FolderWorkspaceOperationStepId) => void;
  selectedNoteLinks: readonly ResolvedWikiLink[];
  selectedNoteBacklinks: readonly ResolvedWikiLink[];
  noteTitlesById: ReadonlyMap<string, string>;
  initialDetailsOpen?: boolean;
  initialNoteActionsOpen?: boolean;
  initialFolderActionsOpen?: boolean;
};

type MoveNoteControlProps = {
  folderOptions: readonly FolderOption[];
  selectedNoteFolderPath: FolderScope;
  onMoveSelectedNote: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
  onOperationMessage: (message: string) => void;
};

type RenameFolderControlProps = {
  selectedFolderPath: FolderScope;
  onRenameSelectedFolder: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
  onOperationMessage: (message: string) => void;
};

type PathChangeQueueProps = {
  operations: readonly FolderWorkspacePathChangeOperation[];
  runningOperationIds: readonly string[];
  onClearCompletedOperations: () => void;
  onRunNextStep: (operationId: string) => void;
  onRetryStep: (operationId: string, stepId: FolderWorkspaceOperationStepId) => void;
};

type FolderNavigationWorkspaceContentProps = {
  isDevelopmentMode: boolean;
  initialPathChangeQueueVisibility?: boolean;
};

type WorkspaceScanState = {
  status: "loading" | "ready" | "failed";
  errorMessage: string | null;
};

type NoteCreateState = {
  status: "idle" | "creating" | "failed";
  errorMessage: string | null;
};

type NoteEditorLoadState = {
  status: "idle" | "loading";
};

type NoteDeleteState = {
  status: "idle" | "deleting" | "failed";
  errorMessage: string | null;
};

type NoteEditorProps = {
  selectedNote: NoteListItem | undefined;
  noteEditBuffer: NoteEditBuffer | null;
  editorLoadState: NoteEditorLoadState;
  editorNotice: string | null;
  onEditContent: (content: string) => void;
  onSaveDraft: () => void;
  saveBlockedReason: string | null;
  onDiscardDraft: () => void;
};

type NoteLinkListProps = {
  kind: "outgoing" | "backlinks";
  heading: string;
  emptyMessage: string;
  links: readonly ResolvedWikiLink[];
  noteTitlesById: ReadonlyMap<string, string>;
};

const initialWorkspaceState: FolderWorkspaceState = {
  notes: [],
  explicitFolders: [],
  selectedFolderPath: null,
  expandedFolderPaths: [],
};

const desktopPathChangeExecutor = createDesktopPathChangeExecutor({
  fileGateway: {
    moveMarkdownFile,
  },
  indexGateway: {
    refreshNoteIndexes,
  },
});

function filterNotesByFolderScope(
  noteList: readonly NoteListItem[],
  selectedFolderPath: FolderScope,
): NoteListItem[] {
  return noteList.filter((note) => isNoteInFolderScope(note.path, selectedFolderPath));
}

function getFolderLabel(folderPath: FolderScope): string {
  return folderPath === null ? "Workspace" : getFolderDisplayName(folderPath);
}

function getFolderPathLabel(folderPath: FolderScope): string {
  return folderPath === null ? "Workspace root" : folderPath;
}

function flattenFolderTree(folderTree: readonly FolderTreeNode[]): FolderOption[] {
  return folderTree.flatMap((node) => [
    { path: node.path, label: node.path },
    ...flattenFolderTree(node.children),
  ]);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The folder path is invalid.";
}

function getPathChangeSummary(pathChanges: readonly FolderWorkspacePathChange[]): string {
  if (pathChanges.length === 0) {
    return "No file path changes were needed.";
  }

  const noun = pathChanges.length === 1 ? "change" : "changes";
  return `${pathChanges.length} file path ${noun} queued for file move and index refresh.`;
}

function getNoteLinkLabel(
  link: ResolvedWikiLink,
  noteTitlesById: ReadonlyMap<string, string>,
  kind: NoteLinkListProps["kind"],
): string {
  if (kind === "backlinks") {
    const sourceTitle = noteTitlesById.get(link.fromId) ?? link.fromId;
    return link.alias === null ? sourceTitle : `${sourceTitle} via ${link.alias}`;
  }

  if (link.toId === null) {
    return link.alias === null ? link.target : `${link.alias} -> ${link.target}`;
  }

  const targetTitle = noteTitlesById.get(link.toId) ?? link.target;
  return link.alias === null ? targetTitle : `${link.alias} -> ${targetTitle}`;
}

function getOperationReasonLabel(reason: FolderWorkspacePathChangeOperation["reason"]): string {
  switch (reason) {
    case "note-move":
      return "Note move";
    case "folder-rename":
      return "Folder rename";
    case "note-delete":
      return "Note delete";
  }
}

function getOperationStepLabel(stepId: FolderWorkspaceOperationStep["id"]): string {
  return stepId === "file-move" ? "Move Markdown files on disk" : "Refresh derived SQLite indexes";
}

function getOperationStepStatusClass(step: FolderWorkspaceOperationStep): string {
  return `folder-navigation__status folder-navigation__status--${step.status}`;
}

function getExpandedFolderPathsForNotes(notes: readonly NoteListItem[]): string[] {
  const folderPaths = new Set<string>();

  for (const note of notes) {
    const folderPath = getFolderPathForNote(note.path);

    if (folderPath === null) {
      continue;
    }

    const segments = folderPath.split("/");

    for (let index = 1; index <= segments.length; index += 1) {
      folderPaths.add(normalizeFolderPath(segments.slice(0, index).join("/")));
    }
  }

  return [...folderPaths].sort(compareWorkspacePaths);
}

function getScanErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Markdown workspace scan failed.";
}

function getNoteReadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Markdown note could not be read.";
}

function getNoteSaveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Markdown note could not be saved.";
}

function getNoteCreateErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Markdown note could not be created.";
}

function getNoteDeleteErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Markdown note could not be deleted.";
}

function getNoteIndexRefreshErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The note indexes could not be refreshed.";
}

const noteSaveBlockedMessage = "Wait for this note's path change to finish before saving.";
const defaultOperationMessage =
  "Path changes refresh the folder tree and note list immediately. File and index work runs in the background.";
const markdownToolbarCommands: readonly { command: MarkdownCommand; label: string }[] = [
  { command: "bold", label: "Bold" },
  { command: "italic", label: "Italic" },
  { command: "heading", label: "Heading" },
  { command: "link", label: "Link" },
  { command: "code", label: "Code" },
];

function WorkspaceScanBanner({ scanState }: { scanState: WorkspaceScanState }) {
  if (scanState.status === "loading") {
    return <p className="folder-navigation__muted">Scanning Markdown files...</p>;
  }

  if (scanState.status === "failed") {
    return (
      <p className="folder-navigation__step-error">
        {scanState.errorMessage ?? "The Markdown workspace scan failed."}
      </p>
    );
  }

  return null;
}

type EmptyNoteListProps = {
  selectedFolderPath: FolderScope;
  scanState: WorkspaceScanState;
};

function EmptyNoteList({ selectedFolderPath, scanState }: EmptyNoteListProps) {
  if (scanState.status === "loading") {
    return null;
  }

  if (scanState.status === "failed") {
    return (
      <div className="folder-navigation__empty">
        <h3 className="folder-navigation__note-title">No notes loaded</h3>
        <p className="folder-navigation__muted">Fix the scan error and reopen this workspace.</p>
      </div>
    );
  }

  return (
    <div className="folder-navigation__empty">
      <h3 className="folder-navigation__note-title">No notes here yet</h3>
      <p className="folder-navigation__muted">Start in {getFolderLabel(selectedFolderPath)}.</p>
    </div>
  );
}

function FolderNode({
  node,
  selectedFolderPath,
  expandedFolderPaths,
  onSelect,
  onToggle,
}: FolderNodeProps) {
  const expanded = expandedFolderPaths.includes(node.path);
  const selected = selectedFolderPath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className="folder-navigation__folder-row"
        style={{ paddingLeft: `${node.depth * 0.75}rem` }}
      >
        <button
          type="button"
          className="folder-navigation__toggle"
          onClick={() => onToggle(node.path)}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          disabled={!hasChildren}
        >
          {hasChildren ? (expanded ? "-" : "+") : ""}
        </button>
        <button
          type="button"
          className={
            selected
              ? "folder-navigation__folder-button folder-navigation__folder-button--selected"
              : "folder-navigation__folder-button"
          }
          onClick={() => onSelect(node.path)}
          aria-pressed={selected}
        >
          <span>{node.name}</span>
          <span className="folder-navigation__count">{node.totalNoteCount}</span>
        </button>
      </div>
      {expanded ? (
        <ol className="folder-navigation__tree">
          {node.children.map((child) => (
            <FolderNode
              key={child.path}
              node={child}
              selectedFolderPath={selectedFolderPath}
              expandedFolderPaths={expandedFolderPaths}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function LibraryColumn({
  noteCount,
  folderTree,
  selectedFolderPath,
  expandedFolderPaths,
  onSelect,
  onToggle,
  activeWorkspaceName,
  recentWorkspaces,
  switchBlockedReason,
  onSwitchWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
}: SidebarProps) {
  return (
    <aside className="folder-navigation__library-column" aria-label="Library">
      <div className="folder-navigation__library-content">
        <p className="folder-navigation__eyebrow">{appName}</p>
        <h1 className="folder-navigation__title">Library</h1>
        <button
          type="button"
          className={
            selectedFolderPath === null
              ? "folder-navigation__root-button folder-navigation__root-button--selected"
              : "folder-navigation__root-button"
          }
          onClick={() => onSelect(null)}
          aria-pressed={selectedFolderPath === null}
        >
          <span>All notes</span>
          <span>{noteCount}</span>
        </button>
        <section className="folder-navigation__folder-group" aria-label="Folders">
          <h2 className="folder-navigation__group-heading">Folders</h2>
          <ol className="folder-navigation__tree folder-navigation__tree--root">
            {folderTree.map((node) => (
              <FolderNode
                key={node.path}
                node={node}
                selectedFolderPath={selectedFolderPath}
                expandedFolderPaths={expandedFolderPaths}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </ol>
        </section>
      </div>
      <WorkspaceSwitcher
        activeWorkspaceName={activeWorkspaceName}
        recentWorkspaces={recentWorkspaces}
        switchBlockedReason={switchBlockedReason}
        onSwitchWorkspace={onSwitchWorkspace}
        onAddWorkspace={onAddWorkspace}
        onRenameWorkspace={onRenameWorkspace}
        onRemoveWorkspace={onRemoveWorkspace}
      />
    </aside>
  );
}

export function WorkspaceSwitcher({
  activeWorkspaceName,
  recentWorkspaces,
  switchBlockedReason,
  onSwitchWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  initiallyOpen = false,
}: WorkspaceSwitcherProps) {
  const popoverId = useId();
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <div className="folder-navigation__workspace-switcher">
      <button
        type="button"
        className="folder-navigation__workspace-switcher-button"
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
      >
        <span className="folder-navigation__workspace-name">{activeWorkspaceName}</span>
        <span className="folder-navigation__workspace-hint">Switch workspace</span>
      </button>
      {isOpen ? (
        <WorkspaceSwitcherPopover
          id={popoverId}
          activeWorkspaceName={activeWorkspaceName}
          recentWorkspaces={recentWorkspaces}
          switchBlockedReason={switchBlockedReason}
          onSwitchWorkspace={async (id) => {
            await onSwitchWorkspace(id);
            setIsOpen(false);
          }}
          onAddWorkspace={async (name, rootPath) => {
            await onAddWorkspace(name, rootPath);
            setIsOpen(false);
          }}
          onRenameWorkspace={async (name) => {
            await onRenameWorkspace(name);
            setIsOpen(false);
          }}
          onRemoveWorkspace={async () => {
            await onRemoveWorkspace();
            setIsOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSwitcherPopover({
  id,
  activeWorkspaceName,
  recentWorkspaces,
  switchBlockedReason,
  onSwitchWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
}: WorkspaceSwitcherPopoverProps) {
  const [view, setView] = useState<PopoverView>("list");
  const [operation, setOperation] = useState<PopoverOperationState>({
    status: "idle",
    errorMessage: null,
  });
  const [addName, setAddName] = useState("");
  const [addPath, setAddPath] = useState("");
  const [renameName, setRenameName] = useState(activeWorkspaceName);

  function switchView(nextView: PopoverView): void {
    setView(nextView);
    setOperation({ status: "idle", errorMessage: null });
  }

  function resetToList(): void {
    switchView("list");
    setAddName("");
    setAddPath("");
    setRenameName(activeWorkspaceName);
  }

  async function handleSwitch(id: string): Promise<void> {
    setOperation({ status: "pending", errorMessage: null });
    try {
      await onSwitchWorkspace(id);
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to switch workspace.",
      });
    }
  }

  async function handleAdd(): Promise<void> {
    if (addName.trim() === "" || addPath.trim() === "") return;
    setOperation({ status: "pending", errorMessage: null });
    try {
      await onAddWorkspace(addName.trim(), addPath.trim());
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to add workspace.",
      });
    }
  }

  async function handleRename(): Promise<void> {
    if (renameName.trim() === "" || renameName.trim() === activeWorkspaceName) return;
    setOperation({ status: "pending", errorMessage: null });
    try {
      await onRenameWorkspace(renameName.trim());
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to rename workspace.",
      });
    }
  }

  async function handleRemove(): Promise<void> {
    const confirmed = window.confirm(
      `Remove "${activeWorkspaceName}" from Grove? Your Markdown files will not be deleted.`,
    );
    if (!confirmed) return;
    setOperation({ status: "pending", errorMessage: null });
    try {
      await onRemoveWorkspace();
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to remove workspace.",
      });
    }
  }

  return (
    <div
      id={id}
      className="folder-navigation__workspace-popover"
      role="dialog"
      aria-label="Workspace switcher"
    >
      <p className="folder-navigation__eyebrow">Current workspace</p>
      <p className="folder-navigation__workspace-popover-title">{activeWorkspaceName}</p>

      {switchBlockedReason !== null ? (
        <p className="folder-navigation__step-error">{switchBlockedReason}</p>
      ) : operation.status === "failed" && view === "list" ? (
        <p className="folder-navigation__step-error">{operation.errorMessage}</p>
      ) : null}

      {view === "list" ? (
        <>
          <div className="folder-navigation__workspace-popover-section">
            <p className="folder-navigation__group-heading">Recent workspaces</p>
            {recentWorkspaces.length > 0 ? (
              <ul className="folder-navigation__workspace-list">
                {recentWorkspaces.map((workspace) => (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      className="folder-navigation__workspace-action"
                      onClick={() => { void handleSwitch(workspace.id); }}
                      disabled={switchBlockedReason !== null || operation.status === "pending"}
                    >
                      {workspace.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="folder-navigation__muted">No recent workspaces yet.</p>
            )}
          </div>
          <div className="folder-navigation__workspace-popover-actions">
            <button
              type="button"
              className="folder-navigation__workspace-action"
              onClick={() => switchView("add")}
            >
              Add workspace
            </button>
            <button
              type="button"
              className="folder-navigation__workspace-action"
              onClick={() => switchView("settings")}
            >
              Workspace settings
            </button>
          </div>
        </>
      ) : null}

      {view === "add" ? (
        <div className="folder-navigation__workspace-popover-section">
          <p className="folder-navigation__group-heading">Add workspace</p>
          <div className="folder-navigation__operation">
            <label className="folder-navigation__label" htmlFor="add-workspace-name">
              Name
            </label>
            <input
              id="add-workspace-name"
              className="folder-navigation__input"
              value={addName}
              onChange={(event) => setAddName(event.target.value)}
              placeholder="My Notes"
              disabled={operation.status === "pending"}
            />
            <label className="folder-navigation__label" htmlFor="add-workspace-path">
              Folder path
            </label>
            <input
              id="add-workspace-path"
              className="folder-navigation__input"
              value={addPath}
              onChange={(event) => setAddPath(event.target.value)}
              placeholder="/Users/you/Notes"
              disabled={operation.status === "pending"}
            />
            {operation.errorMessage !== null ? (
              <p className="folder-navigation__step-error">{operation.errorMessage}</p>
            ) : null}
            <div className="folder-navigation__workspace-popover-actions">
              <button
                type="button"
                className="folder-navigation__action"
                onClick={() => { void handleAdd(); }}
                disabled={operation.status === "pending" || addName.trim() === "" || addPath.trim() === ""}
              >
                {operation.status === "pending" ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                className="folder-navigation__secondary-action"
                onClick={resetToList}
                disabled={operation.status === "pending"}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {view === "settings" ? (
        <div className="folder-navigation__workspace-popover-section">
          <p className="folder-navigation__group-heading">Workspace settings</p>
          <div className="folder-navigation__operation">
            <label className="folder-navigation__label" htmlFor="rename-workspace-name">
              Name
            </label>
            <input
              id="rename-workspace-name"
              className="folder-navigation__input"
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              disabled={operation.status === "pending"}
            />
            {operation.errorMessage !== null ? (
              <p className="folder-navigation__step-error">{operation.errorMessage}</p>
            ) : null}
            <div className="folder-navigation__workspace-popover-actions">
              <button
                type="button"
                className="folder-navigation__action"
                onClick={() => { void handleRename(); }}
                disabled={
                  operation.status === "pending" ||
                  renameName.trim() === "" ||
                  renameName.trim() === activeWorkspaceName
                }
              >
                {operation.status === "pending" ? "Renaming..." : "Rename"}
              </button>
              <button
                type="button"
                className="folder-navigation__secondary-action"
                onClick={resetToList}
                disabled={operation.status === "pending"}
              >
                Cancel
              </button>
            </div>
            <div className="folder-navigation__operation">
              <button
                type="button"
                className="folder-navigation__secondary-action"
                onClick={() => { void handleRemove(); }}
                disabled={operation.status === "pending"}
              >
                Remove from Grove
              </button>
              <p className="folder-navigation__muted">
                Removes this workspace from Grove without deleting your Markdown files.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NavigationPane({
  noteCount,
  folderTree,
  selectedFolderPath,
  expandedFolderPaths,
  onSelect,
  onToggle,
  scopedNotes,
  selectedNoteId,
  scanState,
  createState,
  createTitle,
  onCreateTitleChange,
  onCreateNote,
  onSelectNote,
  activeWorkspaceName,
  recentWorkspaces,
  switchBlockedReason,
  onSwitchWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
}: NavigationPaneProps) {
  return (
    <div className="folder-navigation__navigation">
      <LibraryColumn
        noteCount={noteCount}
        folderTree={folderTree}
        selectedFolderPath={selectedFolderPath}
        expandedFolderPaths={expandedFolderPaths}
        onSelect={onSelect}
        onToggle={onToggle}
        activeWorkspaceName={activeWorkspaceName}
        recentWorkspaces={recentWorkspaces}
        switchBlockedReason={switchBlockedReason}
        onSwitchWorkspace={onSwitchWorkspace}
        onAddWorkspace={onAddWorkspace}
        onRenameWorkspace={onRenameWorkspace}
        onRemoveWorkspace={onRemoveWorkspace}
      />
      <NoteList
        selectedFolderPath={selectedFolderPath}
        scopedNotes={scopedNotes}
        selectedNoteId={selectedNoteId}
        scanState={scanState}
        createState={createState}
        createTitle={createTitle}
        onCreateTitleChange={onCreateTitleChange}
        onCreateNote={onCreateNote}
        onSelectNote={onSelectNote}
      />
    </div>
  );
}

function NoteList({
  selectedFolderPath,
  scopedNotes,
  selectedNoteId,
  scanState,
  createState,
  createTitle,
  onCreateTitleChange,
  onCreateNote,
  onSelectNote,
}: NoteListProps) {
  return (
    <section className="folder-navigation__notes-column" aria-label="Notes">
      <p className="folder-navigation__eyebrow">{getFolderLabel(selectedFolderPath)}</p>
      <h2 className="folder-navigation__heading">Notes</h2>
      <WorkspaceScanBanner scanState={scanState} />
      <div className="folder-navigation__operation">
        <label className="folder-navigation__label" htmlFor="create-note-title">
          New note
        </label>
        <input
          id="create-note-title"
          className="folder-navigation__input"
          value={createTitle}
          onChange={(event) => onCreateTitleChange(event.target.value)}
          placeholder={
            selectedFolderPath === null
              ? "Untitled"
              : `Untitled in ${getFolderDisplayName(selectedFolderPath)}`
          }
          disabled={createState.status === "creating" || scanState.status === "loading"}
        />
        <button
          type="button"
          className="folder-navigation__action"
          onClick={onCreateNote}
          disabled={createState.status === "creating" || scanState.status === "loading"}
        >
          {createState.status === "creating" ? "Creating" : "Create note"}
        </button>
        {createState.errorMessage === null ? null : (
          <p className="folder-navigation__step-error">{createState.errorMessage}</p>
        )}
      </div>
      {scopedNotes.length > 0 ? (
        <ol className="folder-navigation__notes">
          {scopedNotes.map((note) => (
            <li key={note.id} className="folder-navigation__note">
              <button
                type="button"
                className={
                  note.id === selectedNoteId
                    ? "folder-navigation__note-button folder-navigation__note-button--selected"
                    : "folder-navigation__note-button"
                }
                onClick={() => onSelectNote(note.id)}
                aria-pressed={note.id === selectedNoteId}
              >
                <span className="folder-navigation__note-title">{note.title}</span>
                <span className="folder-navigation__muted">
                  {getFolderDisplayName(getFolderPathForNote(note.path))} · {note.updatedLabel}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyNoteList selectedFolderPath={selectedFolderPath} scanState={scanState} />
      )}
    </section>
  );
}

function MoveNoteControl({
  folderOptions,
  selectedNoteFolderPath,
  onMoveSelectedNote,
  onOperationMessage,
}: MoveNoteControlProps) {
  const [moveTargetPath, setMoveTargetPath] = useState<string>(selectedNoteFolderPath ?? "");

  useEffect(() => {
    setMoveTargetPath(selectedNoteFolderPath ?? "");
  }, [selectedNoteFolderPath]);

  function moveSelectedNote(): void {
    try {
      const mutation = onMoveSelectedNote(normalizeFolderScope(moveTargetPath));
      onOperationMessage(getPathChangeSummary(mutation.pathChanges));
    } catch (error) {
      onOperationMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="folder-navigation__operation">
      <label className="folder-navigation__label" htmlFor="move-note-target">
        Move selected note
      </label>
      <select
        id="move-note-target"
        className="folder-navigation__select"
        value={moveTargetPath}
        onChange={(event) => setMoveTargetPath(event.target.value)}
      >
        <option value="">Workspace root</option>
        {folderOptions.map((option) => (
          <option key={option.path ?? "root"} value={option.path ?? ""}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="button" className="folder-navigation__action" onClick={moveSelectedNote}>
        Move note
      </button>
    </div>
  );
}

function RenameFolderControl({
  selectedFolderPath,
  onRenameSelectedFolder,
  onOperationMessage,
}: RenameFolderControlProps) {
  const [renameTargetPath, setRenameTargetPath] = useState<string>(selectedFolderPath ?? "");

  useEffect(() => {
    setRenameTargetPath(selectedFolderPath ?? "");
  }, [selectedFolderPath]);

  function renameSelectedFolder(): void {
    try {
      const targetFolderPath = normalizeFolderScope(renameTargetPath);

      if (
        selectedFolderPath !== null &&
        targetFolderPath !== null &&
        isDescendantFolderPath(targetFolderPath, selectedFolderPath)
      ) {
        onOperationMessage("Choose a folder outside the selected folder.");
        return;
      }

      const mutation = onRenameSelectedFolder(targetFolderPath);
      onOperationMessage(getPathChangeSummary(mutation.pathChanges));
    } catch (error) {
      onOperationMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="folder-navigation__operation">
      <label className="folder-navigation__label" htmlFor="rename-folder-target">
        Rename selected folder
      </label>
      <input
        id="rename-folder-target"
        className="folder-navigation__input"
        value={renameTargetPath}
        onChange={(event) => setRenameTargetPath(event.target.value)}
        disabled={selectedFolderPath === null}
      />
      <button
        type="button"
        className="folder-navigation__action"
        onClick={renameSelectedFolder}
        disabled={selectedFolderPath === null}
      >
        Rename folder
      </button>
      <p className="folder-navigation__muted">
        Current folder: {getFolderPathLabel(selectedFolderPath)}
      </p>
    </div>
  );
}

function NoteEditor({
  selectedNote,
  noteEditBuffer,
  editorLoadState,
  editorNotice,
  onEditContent,
  onSaveDraft,
  saveBlockedReason,
  onDiscardDraft,
}: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<MarkdownSelection | null>(null);

  useLayoutEffect(() => {
    const pendingSelection = pendingSelectionRef.current;
    const textarea = textareaRef.current;

    if (pendingSelection === null || textarea === null) {
      return;
    }

    textarea.setSelectionRange(pendingSelection.start, pendingSelection.end);
    textarea.focus();
    pendingSelectionRef.current = null;
  }, [noteEditBuffer?.draftContent]);

  if (selectedNote === undefined) {
    return <p>Select a note to edit its Markdown content.</p>;
  }

  if (editorLoadState.status === "loading") {
    return <p className="folder-navigation__muted">Loading Markdown content...</p>;
  }

  if (noteEditBuffer === null || noteEditBuffer.noteId !== selectedNote.id) {
    return <p className="folder-navigation__muted">Markdown content is not loaded.</p>;
  }

  const editorDisabled = noteEditBuffer.status === "error" || noteEditBuffer.status === "saving";

  function dispatchMarkdownCommand(command: MarkdownCommand): void {
    const textarea = textareaRef.current;

    if (textarea === null || noteEditBuffer === null) {
      return;
    }

    const result = dispatchMarkdownEditorCommand({
      content: noteEditBuffer.draftContent,
      selection: {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      },
      command,
    });

    pendingSelectionRef.current = result.selection;
    onEditContent(result.content);
  }

  return (
    <div className="folder-navigation__editor-stack">
      <div className="folder-navigation__editor-toolbar">
        <span
          className={`folder-navigation__status folder-navigation__status--${noteEditBuffer.status}`}
        >
          {noteEditBuffer.status}
        </span>
        <button
          type="button"
          className="folder-navigation__action"
          onClick={onSaveDraft}
          disabled={noteEditBuffer.status !== "dirty" || saveBlockedReason !== null}
        >
          Save
        </button>
        <button
          type="button"
          className="folder-navigation__secondary-action"
          onClick={onDiscardDraft}
          disabled={noteEditBuffer.status !== "dirty"}
        >
          Discard draft
        </button>
      </div>
      <div className="folder-navigation__markdown-toolbar" aria-label="Markdown formatting">
        {markdownToolbarCommands.map((item) => (
          <button
            key={item.command}
            type="button"
            className="folder-navigation__format-action"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => dispatchMarkdownCommand(item.command)}
            disabled={editorDisabled}
          >
            {item.label}
          </button>
        ))}
      </div>
      {noteEditBuffer.errorMessage === null ? null : (
        <p className="folder-navigation__step-error">{noteEditBuffer.errorMessage}</p>
      )}
      {editorNotice === null ? null : (
        <p className="folder-navigation__step-error">{editorNotice}</p>
      )}
      {saveBlockedReason === null ? null : (
        <p className="folder-navigation__step-error">{saveBlockedReason}</p>
      )}
      <textarea
        ref={textareaRef}
        className="folder-navigation__textarea"
        value={noteEditBuffer.draftContent}
        onChange={(event) => onEditContent(event.target.value)}
        disabled={editorDisabled}
        aria-label={`Markdown content for ${selectedNote.title}`}
      />
    </div>
  );
}

function NoteLinkList({ kind, heading, emptyMessage, links, noteTitlesById }: NoteLinkListProps) {
  return (
    <section className="folder-navigation__link-section" aria-label={heading}>
      <h3 className="folder-navigation__link-heading">{heading}</h3>
      {links.length === 0 ? (
        <p className="folder-navigation__muted">{emptyMessage}</p>
      ) : (
        <ul className="folder-navigation__link-list">
          {links.map((link, index) => (
            <li key={`${link.fromId}-${link.target}-${link.alias ?? "no-alias"}-${index}`}>
              <span
                className={
                  link.isResolved
                    ? "folder-navigation__link-status"
                    : "folder-navigation__link-status folder-navigation__link-status--unresolved"
                }
              >
                {link.isResolved ? "Resolved" : "Unresolved"}
              </span>
              <span>{getNoteLinkLabel(link, noteTitlesById, kind)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type ActionDisclosureProps = {
  title: string;
  initiallyOpen?: boolean;
  children: ReactNode;
};

function ActionDisclosure({ title, initiallyOpen = false, children }: ActionDisclosureProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <section className="folder-navigation__disclosure">
      <button
        type="button"
        className="folder-navigation__disclosure-toggle"
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <span>{isOpen ? "Hide" : "Show"}</span>
      </button>
      {isOpen ? <div className="folder-navigation__disclosure-content">{children}</div> : null}
    </section>
  );
}

export function ActivePane({
  notes,
  folderOptions,
  selectedFolderPath,
  selectedNoteId,
  noteEditBuffer,
  editorLoadState,
  editorNotice,
  deleteState,
  onMoveSelectedNote,
  onRenameSelectedFolder,
  onEditContent,
  onSaveDraft,
  saveBlockedReason,
  onDiscardDraft,
  deleteBlockedReason,
  onDeleteSelectedNote,
  isDevelopmentMode,
  isPathChangeQueueVisible,
  onTogglePathChangeQueue,
  pathChangeOperations,
  runningOperationIds,
  onClearCompletedOperations,
  onRunNextStep,
  onRetryStep,
  selectedNoteLinks,
  selectedNoteBacklinks,
  noteTitlesById,
  initialDetailsOpen = false,
  initialNoteActionsOpen = false,
  initialFolderActionsOpen = false,
}: ActivePaneProps) {
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0];
  const [noteOperationMessage, setNoteOperationMessage] = useState<string>(defaultOperationMessage);
  const [folderOperationMessage, setFolderOperationMessage] =
    useState<string>(defaultOperationMessage);

  return (
    <section className="folder-navigation__pane">
      <p className="folder-navigation__eyebrow">Active pane</p>
      <div className="folder-navigation__pane-heading">
        <h2 className="folder-navigation__heading">{selectedNote?.title ?? "No note selected"}</h2>
        {isDevelopmentMode ? (
          <button
            type="button"
            className="folder-navigation__queue-toggle"
            onClick={onTogglePathChangeQueue}
          >
            {isPathChangeQueueVisible
              ? "Hide path change diagnostics"
              : "Show path change diagnostics"}
          </button>
        ) : null}
      </div>
      <div className="folder-navigation__editor">
        {selectedNote === undefined ? (
          <p>Select a note to manage its workspace path.</p>
        ) : (
          <>
            <NoteEditor
              selectedNote={selectedNote}
              noteEditBuffer={noteEditBuffer}
              editorLoadState={editorLoadState}
              editorNotice={editorNotice}
              onEditContent={onEditContent}
              onSaveDraft={onSaveDraft}
              saveBlockedReason={saveBlockedReason}
              onDiscardDraft={onDiscardDraft}
            />
            <ActionDisclosure title="Details" initiallyOpen={initialDetailsOpen}>
              <div className="folder-navigation__details">
                <div className="folder-navigation__detail-block">
                  <p className="folder-navigation__link-heading">Path</p>
                  <p className="folder-navigation__path-value">{selectedNote.path}</p>
                </div>
                <div className="folder-navigation__link-sections">
                  <NoteLinkList
                    kind="outgoing"
                    heading="Links"
                    emptyMessage="No WikiLinks in this note yet."
                    links={selectedNoteLinks}
                    noteTitlesById={noteTitlesById}
                  />
                  <NoteLinkList
                    kind="backlinks"
                    heading="Backlinks"
                    emptyMessage="No backlinks point to this note yet."
                    links={selectedNoteBacklinks}
                    noteTitlesById={noteTitlesById}
                  />
                </div>
              </div>
            </ActionDisclosure>
          </>
        )}
        {selectedNote === undefined ? null : (
          <ActionDisclosure title="Note actions" initiallyOpen={initialNoteActionsOpen}>
            <MoveNoteControl
              folderOptions={folderOptions}
              selectedNoteFolderPath={getFolderPathForNote(selectedNote.path)}
              onMoveSelectedNote={onMoveSelectedNote}
              onOperationMessage={setNoteOperationMessage}
            />
            <div className="folder-navigation__operation">
              <button
                type="button"
                className="folder-navigation__secondary-action"
                onClick={onDeleteSelectedNote}
                disabled={deleteState.status === "deleting" || deleteBlockedReason !== null}
              >
                {deleteState.status === "deleting" ? "Deleting" : "Delete note"}
              </button>
              <p className="folder-navigation__muted">
                Permanently deletes the Markdown file from this workspace.
              </p>
              {deleteBlockedReason === null ? null : (
                <p className="folder-navigation__step-error">{deleteBlockedReason}</p>
              )}
              {deleteState.errorMessage === null ? null : (
                <p className="folder-navigation__step-error">{deleteState.errorMessage}</p>
              )}
            </div>
            <p className="folder-navigation__muted">{noteOperationMessage}</p>
          </ActionDisclosure>
        )}
        {isDevelopmentMode && isPathChangeQueueVisible ? (
          <PathChangeQueue
            operations={pathChangeOperations}
            runningOperationIds={runningOperationIds}
            onClearCompletedOperations={onClearCompletedOperations}
            onRunNextStep={onRunNextStep}
            onRetryStep={onRetryStep}
          />
        ) : null}
        <ActionDisclosure title="Folder actions" initiallyOpen={initialFolderActionsOpen}>
          <RenameFolderControl
            selectedFolderPath={selectedFolderPath}
            onRenameSelectedFolder={onRenameSelectedFolder}
            onOperationMessage={setFolderOperationMessage}
          />
          <p className="folder-navigation__muted">{folderOperationMessage}</p>
        </ActionDisclosure>
      </div>
    </section>
  );
}

function PathChangeQueue({
  operations,
  runningOperationIds,
  onClearCompletedOperations,
  onRunNextStep,
  onRetryStep,
}: PathChangeQueueProps) {
  const completedOperationCount = operations.filter(isPathChangeOperationComplete).length;

  return (
    <section className="folder-navigation__queue" aria-label="Pending path changes">
      <p className="folder-navigation__eyebrow">Local operations</p>
      <div className="folder-navigation__queue-heading">
        <h2 className="folder-navigation__heading">Path change queue</h2>
        <button
          type="button"
          className="folder-navigation__secondary-action"
          onClick={onClearCompletedOperations}
          disabled={completedOperationCount === 0}
        >
          Clear completed
        </button>
      </div>
      {operations.length > 0 ? (
        <ol className="folder-navigation__operations">
          {operations.map((operation) => {
            const nextStep = getNextPendingOperationStep(operation);
            const failedSteps = getFailedOperationSteps(operation);
            const complete = isPathChangeOperationComplete(operation);
            const running = runningOperationIds.includes(operation.id);

            return (
              <li key={operation.id} className="folder-navigation__operation-item">
                <div>
                  <h3 className="folder-navigation__operation-title">
                    {getOperationReasonLabel(operation.reason)}
                  </h3>
                  <p className="folder-navigation__muted">
                    {operation.pathChanges.length} file path{" "}
                    {operation.pathChanges.length === 1 ? "change" : "changes"}
                  </p>
                </div>
                <ol className="folder-navigation__steps">
                  {operation.steps.map((step) => (
                    <li key={step.id} className="folder-navigation__step">
                      <span>{getOperationStepLabel(step.id)}</span>
                      <span className={getOperationStepStatusClass(step)}>{step.status}</span>
                      {step.errorMessage === undefined ? null : (
                        <span className="folder-navigation__step-error">{step.errorMessage}</span>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="folder-navigation__queue-actions">
                  <button
                    type="button"
                    className="folder-navigation__action"
                    onClick={() => onRunNextStep(operation.id)}
                    disabled={nextStep === null || running}
                  >
                    {running
                      ? "Running"
                      : nextStep === null
                        ? "Waiting"
                        : `Run ${getOperationStepLabel(nextStep.id)}`}
                  </button>
                  {failedSteps.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      className="folder-navigation__secondary-action"
                      onClick={() => onRetryStep(operation.id, step.id)}
                    >
                      Retry {getOperationStepLabel(step.id)}
                    </button>
                  ))}
                  {complete ? (
                    <span className="folder-navigation__muted">
                      File move and index refresh are complete.
                    </span>
                  ) : null}
                </div>
                <ol className="folder-navigation__path-changes">
                  {operation.pathChanges.map((pathChange) => (
                    <li key={`${operation.id}-${pathChange.noteId}`}>
                      <span>{pathChange.previousPath}</span>
                      <span>{pathChange.nextPath}</span>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="folder-navigation__empty">
          <h3 className="folder-navigation__note-title">No pending path changes</h3>
          <p className="folder-navigation__muted">
            Move a note or rename a folder to queue local file and index work.
          </p>
        </div>
      )}
    </section>
  );
}

export function getFolderNavigationWorkspaceClassName(showPathChangeQueue: boolean): string {
  void showPathChangeQueue;
  return "folder-navigation";
}

export function FolderNavigationWorkspaceContent({
  isDevelopmentMode,
  initialPathChangeQueueVisibility = false,
}: FolderNavigationWorkspaceContentProps) {
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const allWorkspaces = useWorkspaceStore((state) => state.allWorkspaces);
  const workspaceLoadState = useWorkspaceStore((state) => state.loadState);

  const [isPathChangeQueueVisible, setIsPathChangeQueueVisible] = useState(
    initialPathChangeQueueVisibility,
  );
  const [workspaceState, setWorkspaceState] = useState<FolderWorkspaceState>(initialWorkspaceState);
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [noteEditBuffer, setNoteEditBuffer] = useState<NoteEditBuffer | null>(null);
  const [editorLoadState, setEditorLoadState] = useState<NoteEditorLoadState>({ status: "idle" });
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createState, setCreateState] = useState<NoteCreateState>({
    status: "idle",
    errorMessage: null,
  });
  const [deleteState, setDeleteState] = useState<NoteDeleteState>({
    status: "idle",
    errorMessage: null,
  });
  const [scanState, setScanState] = useState<WorkspaceScanState>({
    status: "loading",
    errorMessage: null,
  });
  const savingNoteIdSet = useRef(new Set<string>());
  const selectedNoteIdRef = useRef(selectedNoteId);
  const {
    pathChangeOperations,
    runningOperationIds,
    queuePathChangeOperation,
    retryPathChangeStep,
    clearCompletedPathChanges,
    runNextPathChangeStep,
  } = usePathChangeQueue(desktopPathChangeExecutor);
  const { notes, explicitFolders, selectedFolderPath, expandedFolderPaths } = workspaceState;

  const folderTree = useMemo(() => {
    return buildFolderTree(
      notes.map((note) => note.path),
      explicitFolders,
    );
  }, [explicitFolders, notes]);
  const folderOptions = useMemo(() => {
    return flattenFolderTree(folderTree);
  }, [folderTree]);
  const scopedNotes = useMemo(() => {
    return filterNotesByFolderScope(notes, selectedFolderPath);
  }, [notes, selectedFolderPath]);
  const selectedNote = useMemo(() => {
    return notes.find((note) => note.id === selectedNoteId) ?? notes[0];
  }, [notes, selectedNoteId]);
  const resolvedNoteLinks = useMemo(() => {
    return resolveWikiLinks(
      notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content ?? "",
      })),
    );
  }, [notes]);
  const resolvedNoteLinksByNoteId = useMemo(() => {
    return new Map(resolvedNoteLinks.map((noteLinks) => [noteLinks.noteId, noteLinks]));
  }, [resolvedNoteLinks]);
  const noteTitlesById = useMemo(() => {
    return new Map(notes.map((note) => [note.id, note.title]));
  }, [notes]);
  const selectedResolvedNoteLinks = selectedNote
    ? (resolvedNoteLinksByNoteId.get(selectedNote.id) ?? null)
    : null;
  const saveBlockedReason =
    !canSaveNoteEditBuffer(noteEditBuffer) ||
    !isNoteSaveBlockedByPathChange(pathChangeOperations, noteEditBuffer.noteId)
      ? null
      : noteSaveBlockedMessage;
  const deleteBlockedReason =
    selectedNote === undefined || !isNoteAffectedByPathChange(pathChangeOperations, selectedNote.id)
      ? null
      : "Delete is unavailable while this note has unfinished path changes.";
  const switchBlockedReason = isNoteEditBufferBlockingWorkspaceChange(noteEditBuffer)
    ? "Save or discard the current draft before switching workspaces."
    : null;
  const recentWorkspaces = getRecentWorkspaces(allWorkspaces, activeWorkspace?.id);

  async function handleSwitchWorkspace(id: string): Promise<void> {
    await useWorkspaceStore.getState().switchTo(id);
  }

  async function handleAddWorkspace(name: string, rootPath: string): Promise<void> {
    await useWorkspaceStore.getState().addNew(name, rootPath);
  }

  async function handleRenameWorkspace(name: string): Promise<void> {
    const id = useWorkspaceStore.getState().activeWorkspace?.id;
    if (id === undefined) return;
    await useWorkspaceStore.getState().renameCurrent(id, name);
  }

  async function handleRemoveWorkspace(): Promise<void> {
    const id = useWorkspaceStore.getState().activeWorkspace?.id;
    if (id === undefined) return;
    await useWorkspaceStore.getState().removeCurrent(id);
  }

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId;
  }, [selectedNoteId]);

  function applyWorkspaceState(nextState: FolderWorkspaceState): void {
    setWorkspaceState(reconcileFolderWorkspaceState(nextState));
  }

  function toggleFolder(path: string): void {
    setWorkspaceState((currentState) => {
      if (currentState.expandedFolderPaths.includes(path)) {
        return {
          ...currentState,
          expandedFolderPaths: currentState.expandedFolderPaths.filter(
            (currentPath) => currentPath !== path,
          ),
        };
      }

      return {
        ...currentState,
        expandedFolderPaths: [...currentState.expandedFolderPaths, path],
      };
    });
  }

  function selectFolder(path: FolderScope): void {
    setWorkspaceState((currentState) => ({
      ...currentState,
      selectedFolderPath: path,
    }));
  }

  function selectNote(noteId: string): void {
    if (
      noteEditBuffer !== null &&
      isNoteEditBufferBlockingWorkspaceChange(noteEditBuffer) &&
      noteEditBuffer.noteId !== noteId &&
      selectedNoteId !== noteId
    ) {
      setEditorNotice("Save or discard the current draft before opening another note.");
      return;
    }

    setEditorNotice(null);
    if (deleteState.errorMessage !== null) {
      setDeleteState({ status: "idle", errorMessage: null });
    }
    setSelectedNoteId(noteId);
  }

  function moveSelectedNote(targetFolderPath: FolderScope): FolderWorkspaceMutation {
    if (isNoteEditBufferBlockingWorkspaceChange(noteEditBuffer)) {
      throw new Error("Save or discard the current draft before moving notes.");
    }

    const mutation = moveNoteInFolderWorkspace(workspaceState, selectedNoteId, targetFolderPath);
    applyWorkspaceState(mutation.state);
    queuePathChangeOperation(mutation);
    return mutation;
  }

  function renameSelectedFolder(targetFolderPath: FolderScope): FolderWorkspaceMutation {
    if (isNoteEditBufferBlockingWorkspaceChange(noteEditBuffer)) {
      throw new Error("Save or discard the current draft before renaming folders.");
    }

    if (selectedFolderPath === null) {
      return {
        affectedNoteIds: [],
        indexRefresh: {
          noteIds: [],
          reason: "folder-rename",
        },
        pathChanges: [],
        state: workspaceState,
      };
    }

    const mutation = renameFolderInWorkspace(workspaceState, selectedFolderPath, targetFolderPath);
    applyWorkspaceState(mutation.state);
    queuePathChangeOperation(mutation);
    return mutation;
  }

  function editSelectedNoteContent(content: string): void {
    setNoteEditBuffer((currentBuffer) => {
      if (currentBuffer === null) {
        return currentBuffer;
      }

      return updateNoteEditDraft(currentBuffer, content);
    });
    setEditorNotice(null);
  }

  const deleteSelectedNote = useCallback(async (): Promise<void> => {
    const note = selectedNote;

    if (note === undefined || deleteState.status === "deleting") {
      return;
    }

    if (isNoteAffectedByPathChange(pathChangeOperations, note.id)) {
      setDeleteState({
        status: "failed",
        errorMessage: "Delete is unavailable while this note has unfinished path changes.",
      });
      return;
    }

    if (isNoteEditBufferBlockingWorkspaceChange(noteEditBuffer)) {
      setDeleteState({
        status: "failed",
        errorMessage: "Save or discard the current draft before deleting a note.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete "${note.title}" permanently from this workspace? This removes the Markdown file.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteState({
      status: "deleting",
      errorMessage: null,
    });
    setEditorNotice(null);

    try {
      await deleteMarkdownNote({ path: note.path });

      let nextSelectedNoteId = "";

      setWorkspaceState((currentState) => {
        const deleteMutation = deleteSelectedNoteFromFolderWorkspace(
          currentState,
          note.id,
          selectedNoteIdRef.current,
        );

        nextSelectedNoteId = deleteMutation.nextSelectedNoteId;
        return deleteMutation.mutation.state;
      });
      setSelectedNoteId(nextSelectedNoteId);
      setNoteEditBuffer((currentBuffer) => {
        if (currentBuffer?.noteId !== note.id) {
          return currentBuffer;
        }

        return null;
      });
      setDeleteState({
        status: "idle",
        errorMessage: null,
      });

      try {
        await refreshNoteIndexes({
          noteIds: [note.id],
          reason: "note-delete",
        });
      } catch (error) {
        setEditorNotice(
          `Deleted, but index refresh failed: ${getNoteIndexRefreshErrorMessage(error)}`,
        );
      }
    } catch (error) {
      setDeleteState({
        status: "failed",
        errorMessage: getNoteDeleteErrorMessage(error),
      });
    }
  }, [deleteState.status, noteEditBuffer, pathChangeOperations, selectedNote]);

  const createNoteInSelectedFolder = useCallback(async (): Promise<void> => {
    if (scanState.status !== "ready" || createState.status === "creating") {
      return;
    }

    if (isNoteEditBufferBlockingWorkspaceChange(noteEditBuffer)) {
      setCreateState({
        status: "failed",
        errorMessage: "Save or discard the current draft before creating another note.",
      });
      return;
    }

    const nextPath = createNewNotePath(
      createTitle,
      selectedFolderPath,
      workspaceState.notes.map((note) => note.path),
    );

    setCreateState({
      status: "creating",
      errorMessage: null,
    });

    try {
      const createdNote = await createMarkdownNote({
        path: nextPath,
        content: "",
      });
      const [mappedNote] = mapScannedMarkdownNotes([createdNote]);

      if (mappedNote === undefined) {
        throw new Error("The created Markdown note metadata was missing.");
      }

      setWorkspaceState((currentState) =>
        reconcileFolderWorkspaceState({
          ...currentState,
          notes: [...currentState.notes, mappedNote].sort((left, right) =>
            compareWorkspacePaths(left.path, right.path),
          ),
          selectedFolderPath,
          expandedFolderPaths: [
            ...currentState.expandedFolderPaths,
            ...getExpandedFolderPathsForNotes([mappedNote]),
          ],
        }),
      );
      setSelectedNoteId(mappedNote.id);
      setCreateTitle("");
      setCreateState({
        status: "idle",
        errorMessage: null,
      });
      setEditorNotice(null);

      try {
        await refreshNoteIndexes({
          noteIds: [mappedNote.id],
          reason: "note-create",
        });
      } catch (error) {
        setEditorNotice(
          `Created, but index refresh failed: ${getNoteIndexRefreshErrorMessage(error)}`,
        );
      }
    } catch (error) {
      setCreateState({
        status: "failed",
        errorMessage: getNoteCreateErrorMessage(error),
      });
    }
  }, [
    createState.status,
    createTitle,
    noteEditBuffer,
    scanState.status,
    selectedFolderPath,
    workspaceState.notes,
  ]);

  function markSelectedNoteDraftSaved(buffer: NoteEditBuffer): void {
    setNoteEditBuffer((currentBuffer) => {
      if (currentBuffer === null || currentBuffer.noteId !== buffer.noteId) {
        return currentBuffer;
      }

      return markNoteEditBufferSaved(currentBuffer, buffer.draftContent);
    });
  }

  function markSelectedNoteDraftSaveFailed(buffer: NoteEditBuffer, error: unknown): void {
    setNoteEditBuffer((currentBuffer) => {
      if (currentBuffer === null || currentBuffer.noteId !== buffer.noteId) {
        return currentBuffer;
      }

      return markNoteEditBufferSaveFailed(currentBuffer, getNoteSaveErrorMessage(error));
    });
  }

  const saveSelectedNoteDraft = useCallback(async (): Promise<void> => {
    const buffer = noteEditBuffer;

    if (!canSaveNoteEditBuffer(buffer) || savingNoteIdSet.current.has(buffer.noteId)) {
      return;
    }

    if (isNoteSaveBlockedByPathChange(pathChangeOperations, buffer.noteId)) {
      setEditorNotice(noteSaveBlockedMessage);
      return;
    }

    savingNoteIdSet.current.add(buffer.noteId);
    setNoteEditBuffer((currentBuffer) => {
      if (currentBuffer === null || currentBuffer.noteId !== buffer.noteId) {
        return currentBuffer;
      }

      return canSaveNoteEditBuffer(currentBuffer)
        ? markNoteEditBufferSaving(currentBuffer)
        : currentBuffer;
    });
    setEditorNotice(null);

    try {
      const savedNote = await writeMarkdownNote({
        path: buffer.path,
        content: buffer.draftContent,
      });
      setWorkspaceState((currentState) =>
        applySavedNoteMetadataToWorkspaceState(currentState, {
          noteId: buffer.noteId,
          previousPath: buffer.path,
          savedNote,
        }),
      );
      markSelectedNoteDraftSaved(buffer);

      try {
        await refreshNoteIndexes({
          noteIds: [buffer.noteId],
          reason: "note-save",
        });
      } catch (error) {
        setEditorNotice(`Saved, but index refresh failed: ${getNoteSaveErrorMessage(error)}`);
      }
    } catch (error) {
      markSelectedNoteDraftSaveFailed(buffer, error);
    } finally {
      savingNoteIdSet.current.delete(buffer.noteId);
    }
  }, [noteEditBuffer, pathChangeOperations]);

  function discardSelectedDraft(): void {
    setNoteEditBuffer((currentBuffer) => {
      if (currentBuffer === null || currentBuffer.status !== "dirty") {
        return currentBuffer;
      }

      return discardNoteEditDraft(currentBuffer);
    });
    setEditorNotice(null);
  }

  useEffect(() => {
    void useWorkspaceStore.getState().loadWorkspaces();
  }, []);

  useEffect(() => {
    if (activeWorkspace === null) {
      return;
    }

    setWorkspaceState(initialWorkspaceState);
    setSelectedNoteId("");
    setNoteEditBuffer(null);
    setEditorNotice(null);
    setScanState({ status: "loading", errorMessage: null });
    setCreateState({ status: "idle", errorMessage: null });
    setDeleteState({ status: "idle", errorMessage: null });

    let canceled = false;

    async function scanWorkspace(): Promise<void> {
      try {
        const scannedNotes = await scanMarkdownWorkspace();
        const notes = mapScannedMarkdownNotes(scannedNotes);

        if (canceled) {
          return;
        }

        setWorkspaceState({
          notes,
          explicitFolders: [],
          selectedFolderPath: null,
          expandedFolderPaths: getExpandedFolderPathsForNotes(notes),
        });
        setSelectedNoteId(notes[0]?.id ?? "");
        setScanState({
          status: "ready",
          errorMessage: null,
        });
        setCreateState({
          status: "idle",
          errorMessage: null,
        });
        setDeleteState({
          status: "idle",
          errorMessage: null,
        });
      } catch (error) {
        if (canceled) {
          return;
        }

        setScanState({
          status: "failed",
          errorMessage: getScanErrorMessage(error),
        });
      }
    }

    void scanWorkspace();

    return () => {
      canceled = true;
    };
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (selectedNote === undefined) {
      setNoteEditBuffer(null);
      setEditorLoadState({ status: "idle" });
      setEditorNotice(null);
      return;
    }

    if (noteEditBuffer?.noteId === selectedNote.id && noteEditBuffer.status !== "error") {
      if (noteEditBuffer.path !== selectedNote.path) {
        setNoteEditBuffer(updateNoteEditBufferPath(noteEditBuffer, selectedNote.path));
      }
      setEditorLoadState({ status: "idle" });
      return;
    }

    if (
      noteEditBuffer?.noteId === selectedNote.id &&
      noteEditBuffer.path === selectedNote.path &&
      noteEditBuffer.status === "clean"
    ) {
      return;
    }

    let canceled = false;

    async function loadSelectedNote(): Promise<void> {
      setEditorLoadState({ status: "loading" });
      setEditorNotice(null);
      setNoteEditBuffer(null);

      try {
        const content = await readMarkdownNote({ path: selectedNote.path });

        if (canceled) {
          return;
        }

        setNoteEditBuffer(createCleanNoteEditBuffer(selectedNote.id, selectedNote.path, content));
      } catch (error) {
        if (canceled) {
          return;
        }

        setNoteEditBuffer(
          createErroredNoteEditBuffer(
            selectedNote.id,
            selectedNote.path,
            getNoteReadErrorMessage(error),
          ),
        );
      } finally {
        if (!canceled) {
          setEditorLoadState({ status: "idle" });
        }
      }
    }

    void loadSelectedNote();

    return () => {
      canceled = true;
    };
  }, [selectedNote?.id, selectedNote?.path]);

  useEffect(() => {
    function saveOnKeyboardShortcut(event: KeyboardEvent): void {
      if (!isNoteSaveKeyboardShortcut(event)) {
        return;
      }

      event.preventDefault();

      if (!canSaveNoteEditBuffer(noteEditBuffer)) {
        return;
      }

      if (isNoteSaveBlockedByPathChange(pathChangeOperations, noteEditBuffer.noteId)) {
        setEditorNotice(noteSaveBlockedMessage);
        return;
      }

      void saveSelectedNoteDraft();
    }

    window.addEventListener("keydown", saveOnKeyboardShortcut);

    return () => {
      window.removeEventListener("keydown", saveOnKeyboardShortcut);
    };
  }, [noteEditBuffer, pathChangeOperations, saveSelectedNoteDraft]);

  return (
    <section
      className={getFolderNavigationWorkspaceClassName(
        isDevelopmentMode && isPathChangeQueueVisible,
      )}
    >
      <NavigationPane
        noteCount={notes.length}
        folderTree={folderTree}
        selectedFolderPath={selectedFolderPath}
        expandedFolderPaths={expandedFolderPaths}
        onSelect={selectFolder}
        onToggle={toggleFolder}
        scopedNotes={scopedNotes}
        selectedNoteId={selectedNoteId}
        scanState={scanState}
        createState={createState}
        createTitle={createTitle}
        onCreateTitleChange={(title) => {
          setCreateTitle(title);
          if (createState.errorMessage !== null) {
            setCreateState({ status: "idle", errorMessage: null });
          }
        }}
        onCreateNote={() => {
          void createNoteInSelectedFolder();
        }}
        onSelectNote={selectNote}
        activeWorkspaceName={activeWorkspace?.name ?? (workspaceLoadState.status === "loading" ? "Loading..." : "")}
        recentWorkspaces={recentWorkspaces}
        switchBlockedReason={switchBlockedReason}
        onSwitchWorkspace={handleSwitchWorkspace}
        onAddWorkspace={handleAddWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onRemoveWorkspace={handleRemoveWorkspace}
      />
      <ActivePane
        notes={notes}
        folderOptions={folderOptions}
        selectedFolderPath={selectedFolderPath}
        selectedNoteId={selectedNoteId}
        noteEditBuffer={noteEditBuffer}
        editorLoadState={editorLoadState}
        editorNotice={editorNotice}
        deleteState={deleteState}
        onMoveSelectedNote={moveSelectedNote}
        onRenameSelectedFolder={renameSelectedFolder}
        onEditContent={editSelectedNoteContent}
        onSaveDraft={() => {
          void saveSelectedNoteDraft();
        }}
        saveBlockedReason={saveBlockedReason}
        onDiscardDraft={discardSelectedDraft}
        deleteBlockedReason={deleteBlockedReason}
        onDeleteSelectedNote={() => {
          void deleteSelectedNote();
        }}
        isDevelopmentMode={isDevelopmentMode}
        isPathChangeQueueVisible={isPathChangeQueueVisible}
        onTogglePathChangeQueue={() => {
          setIsPathChangeQueueVisible((currentVisibility) => !currentVisibility);
        }}
        pathChangeOperations={pathChangeOperations}
        runningOperationIds={runningOperationIds}
        onClearCompletedOperations={clearCompletedPathChanges}
        onRunNextStep={(operationId) => {
          void runNextPathChangeStep(operationId);
        }}
        onRetryStep={retryPathChangeStep}
        selectedNoteLinks={selectedResolvedNoteLinks?.links ?? []}
        selectedNoteBacklinks={selectedResolvedNoteLinks?.backlinks ?? []}
        noteTitlesById={noteTitlesById}
      />
    </section>
  );
}

export function FolderNavigationWorkspace() {
  return <FolderNavigationWorkspaceContent isDevelopmentMode={import.meta.env.DEV} />;
}
