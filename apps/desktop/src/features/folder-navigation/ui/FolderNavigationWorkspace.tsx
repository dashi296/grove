import {
  appName,
  buildFolderTree,
  compareWorkspacePaths,
  getFolderDisplayName,
  getFolderPathForNote,
  isNoteInFolderScope,
  normalizeFolderPath,
  normalizeFolderScope,
} from "@grove/core";
import type { FolderScope, FolderTreeNode } from "@grove/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  moveMarkdownFile,
  readMarkdownNote,
  refreshNoteIndexes,
  scanMarkdownWorkspace,
  writeMarkdownNote,
} from "../../../shared";
import {
  clearCompletedPathChangeOperations,
  createPathChangeOperation,
  getFailedOperationSteps,
  getNextPendingOperationStep,
  getNextRunnablePathChangeOperationId,
  isDescendantFolderPath,
  isPathChangeOperationComplete,
  moveNoteInFolderWorkspace,
  reconcileFolderWorkspaceState,
  renameFolderInWorkspace,
  retryOperationStep,
  runNextOperationStep,
} from "../model/folderWorkspaceState";
import { createDesktopPathChangeExecutor } from "../model/folderPathChangeExecutor";
import {
  createCleanNoteEditBuffer,
  createErroredNoteEditBuffer,
  discardNoteEditDraft,
  markNoteEditBufferSaved,
  markNoteEditBufferSaveFailed,
  markNoteEditBufferSaving,
  updateNoteEditDraft,
} from "../model/noteEditBuffer";
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

type SidebarProps = {
  noteCount: number;
  folderTree: readonly FolderTreeNode[];
  selectedFolderPath: FolderScope;
  expandedFolderPaths: readonly string[];
  onSelect: (path: FolderScope) => void;
  onToggle: (path: string) => void;
};

type NoteListProps = {
  selectedFolderPath: FolderScope;
  scopedNotes: readonly NoteListItem[];
  selectedNoteId: string;
  scanState: WorkspaceScanState;
  onSelectNote: (noteId: string) => void;
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
  onMoveSelectedNote: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
  onRenameSelectedFolder: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
  onEditContent: (content: string) => void;
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
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

type WorkspaceScanState = {
  status: "loading" | "ready" | "failed";
  errorMessage: string | null;
};

type NoteEditorLoadState = {
  status: "idle" | "loading";
};

type NoteEditorProps = {
  selectedNote: NoteListItem | undefined;
  noteEditBuffer: NoteEditBuffer | null;
  editorLoadState: NoteEditorLoadState;
  editorNotice: string | null;
  onEditContent: (content: string) => void;
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
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

function getOperationReasonLabel(reason: FolderWorkspacePathChangeOperation["reason"]): string {
  return reason === "note-move" ? "Note move" : "Folder rename";
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

function Sidebar({
  noteCount,
  folderTree,
  selectedFolderPath,
  expandedFolderPaths,
  onSelect,
  onToggle,
}: SidebarProps) {
  return (
    <aside className="folder-navigation__sidebar">
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
    </aside>
  );
}

function NoteList({
  selectedFolderPath,
  scopedNotes,
  selectedNoteId,
  scanState,
  onSelectNote,
}: NoteListProps) {
  return (
    <section className="folder-navigation__note-list" aria-label="Notes">
      <p className="folder-navigation__eyebrow">{getFolderLabel(selectedFolderPath)}</p>
      <h2 className="folder-navigation__heading">Notes</h2>
      <WorkspaceScanBanner scanState={scanState} />
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
  onDiscardDraft,
}: NoteEditorProps) {
  if (selectedNote === undefined) {
    return <p>Select a note to edit its Markdown content.</p>;
  }

  if (editorLoadState.status === "loading") {
    return <p className="folder-navigation__muted">Loading Markdown content...</p>;
  }

  if (noteEditBuffer === null || noteEditBuffer.noteId !== selectedNote.id) {
    return <p className="folder-navigation__muted">Markdown content is not loaded.</p>;
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
          disabled={noteEditBuffer.status !== "dirty"}
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
      {noteEditBuffer.errorMessage === null ? null : (
        <p className="folder-navigation__step-error">{noteEditBuffer.errorMessage}</p>
      )}
      {editorNotice === null ? null : (
        <p className="folder-navigation__step-error">{editorNotice}</p>
      )}
      <textarea
        className="folder-navigation__textarea"
        value={noteEditBuffer.draftContent}
        onChange={(event) => onEditContent(event.target.value)}
        disabled={noteEditBuffer.status === "error" || noteEditBuffer.status === "saving"}
        aria-label={`Markdown content for ${selectedNote.title}`}
      />
    </div>
  );
}

function ActivePane({
  notes,
  folderOptions,
  selectedFolderPath,
  selectedNoteId,
  noteEditBuffer,
  editorLoadState,
  editorNotice,
  onMoveSelectedNote,
  onRenameSelectedFolder,
  onEditContent,
  onSaveDraft,
  onDiscardDraft,
}: ActivePaneProps) {
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0];
  const [operationMessage, setOperationMessage] = useState<string>(
    "Path changes refresh the folder tree and note list immediately. File and index work runs in the background.",
  );

  return (
    <section className="folder-navigation__pane">
      <p className="folder-navigation__eyebrow">Active pane</p>
      <h2 className="folder-navigation__heading">{selectedNote?.title ?? "No note selected"}</h2>
      <div className="folder-navigation__editor">
        {selectedNote === undefined ? (
          <p>Select a note to manage its workspace path.</p>
        ) : (
          <>
            <p>Path: {selectedNote.path}</p>
            <NoteEditor
              selectedNote={selectedNote}
              noteEditBuffer={noteEditBuffer}
              editorLoadState={editorLoadState}
              editorNotice={editorNotice}
              onEditContent={onEditContent}
              onSaveDraft={onSaveDraft}
              onDiscardDraft={onDiscardDraft}
            />
            <MoveNoteControl
              folderOptions={folderOptions}
              selectedNoteFolderPath={getFolderPathForNote(selectedNote.path)}
              onMoveSelectedNote={onMoveSelectedNote}
              onOperationMessage={setOperationMessage}
            />
          </>
        )}
        <RenameFolderControl
          selectedFolderPath={selectedFolderPath}
          onRenameSelectedFolder={onRenameSelectedFolder}
          onOperationMessage={setOperationMessage}
        />
        <p className="folder-navigation__muted">{operationMessage}</p>
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

export function FolderNavigationWorkspace() {
  const [workspaceState, setWorkspaceState] = useState<FolderWorkspaceState>(initialWorkspaceState);
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [noteEditBuffer, setNoteEditBuffer] = useState<NoteEditBuffer | null>(null);
  const [editorLoadState, setEditorLoadState] = useState<NoteEditorLoadState>({ status: "idle" });
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [scanState, setScanState] = useState<WorkspaceScanState>({
    status: "loading",
    errorMessage: null,
  });
  const [pathChangeOperations, setPathChangeOperations] = useState<
    readonly FolderWorkspacePathChangeOperation[]
  >([]);
  const [runningOperationIds, setRunningOperationIds] = useState<readonly string[]>([]);
  const runningOperationIdSet = useRef(new Set<string>());
  const nextOperationNumber = useRef(1);
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
      (noteEditBuffer?.status === "dirty" || noteEditBuffer?.status === "saving") &&
      noteEditBuffer.noteId !== noteId &&
      selectedNoteId !== noteId
    ) {
      setEditorNotice("Save or discard the current draft before opening another note.");
      return;
    }

    setEditorNotice(null);
    setSelectedNoteId(noteId);
  }

  function queuePathChangeOperation(mutation: FolderWorkspaceMutation): void {
    const operation = createPathChangeOperation(
      `path-change-${nextOperationNumber.current}`,
      mutation,
    );

    if (operation === null) {
      return;
    }

    nextOperationNumber.current += 1;
    setPathChangeOperations((currentOperations) => [operation, ...currentOperations]);
  }

  function retryPathChangeStep(operationId: string, stepId: FolderWorkspaceOperationStepId): void {
    setPathChangeOperations((currentOperations) =>
      retryOperationStep(currentOperations, operationId, stepId),
    );
  }

  function clearCompletedPathChanges(): void {
    setPathChangeOperations(clearCompletedPathChangeOperations);
  }

  async function runNextPathChangeStep(operationId: string): Promise<void> {
    const operation = pathChangeOperations.find((currentOperation) => {
      return currentOperation.id === operationId;
    });

    if (operation === undefined || runningOperationIdSet.current.has(operationId)) {
      return;
    }

    runningOperationIdSet.current.add(operationId);
    setRunningOperationIds((currentOperationIds) => [...currentOperationIds, operationId]);

    try {
      const nextOperation = await runNextOperationStep(operation, desktopPathChangeExecutor);

      setPathChangeOperations((currentOperations) =>
        currentOperations.map((currentOperation) => {
          return currentOperation.id === operationId ? nextOperation : currentOperation;
        }),
      );
    } finally {
      runningOperationIdSet.current.delete(operationId);
      setRunningOperationIds((currentOperationIds) =>
        currentOperationIds.filter((currentOperationId) => currentOperationId !== operationId),
      );
    }
  }

  function moveSelectedNote(targetFolderPath: FolderScope): FolderWorkspaceMutation {
    const mutation = moveNoteInFolderWorkspace(workspaceState, selectedNoteId, targetFolderPath);
    applyWorkspaceState(mutation.state);
    queuePathChangeOperation(mutation);
    return mutation;
  }

  function renameSelectedFolder(targetFolderPath: FolderScope): FolderWorkspaceMutation {
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

  const saveSelectedNoteDraft = useCallback(async (): Promise<void> => {
    const buffer = noteEditBuffer;

    if (buffer === null || buffer.status !== "dirty") {
      return;
    }

    setNoteEditBuffer(markNoteEditBufferSaving(buffer));
    setEditorNotice(null);

    try {
      const savedNote = await writeMarkdownNote({
        path: buffer.path,
        content: buffer.draftContent,
      });
      const [updatedNote] = mapScannedMarkdownNotes([savedNote]);

      setWorkspaceState((currentState) =>
        reconcileFolderWorkspaceState({
          ...currentState,
          notes: currentState.notes.map((note) => {
            return note.id === buffer.noteId
              ? { ...note, ...updatedNote, id: buffer.noteId }
              : note;
          }),
        }),
      );
      setNoteEditBuffer(markNoteEditBufferSaved(buffer, buffer.draftContent));

      try {
        await refreshNoteIndexes({
          noteIds: [buffer.noteId],
          reason: "note-save",
        });
      } catch (error) {
        setEditorNotice(`Saved, but index refresh failed: ${getNoteSaveErrorMessage(error)}`);
      }
    } catch (error) {
      setNoteEditBuffer(markNoteEditBufferSaveFailed(buffer, getNoteSaveErrorMessage(error)));
    }
  }, [noteEditBuffer]);

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
  }, []);

  useEffect(() => {
    if (selectedNote === undefined) {
      setNoteEditBuffer(null);
      setEditorLoadState({ status: "idle" });
      setEditorNotice(null);
      return;
    }

    if (noteEditBuffer?.noteId === selectedNote.id && noteEditBuffer.status === "dirty") {
      if (noteEditBuffer.path !== selectedNote.path) {
        setNoteEditBuffer({
          ...noteEditBuffer,
          path: selectedNote.path,
        });
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
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
        return;
      }

      event.preventDefault();
      void saveSelectedNoteDraft();
    }

    window.addEventListener("keydown", saveOnKeyboardShortcut);

    return () => {
      window.removeEventListener("keydown", saveOnKeyboardShortcut);
    };
  }, [saveSelectedNoteDraft]);

  useEffect(() => {
    const nextRunnableOperationId = getNextRunnablePathChangeOperationId(
      pathChangeOperations,
      runningOperationIds,
    );

    if (nextRunnableOperationId === null) {
      return;
    }

    void runNextPathChangeStep(nextRunnableOperationId);
  }, [pathChangeOperations, runNextPathChangeStep, runningOperationIds]);

  return (
    <section className="folder-navigation">
      <Sidebar
        noteCount={notes.length}
        folderTree={folderTree}
        selectedFolderPath={selectedFolderPath}
        expandedFolderPaths={expandedFolderPaths}
        onSelect={selectFolder}
        onToggle={toggleFolder}
      />
      <NoteList
        selectedFolderPath={selectedFolderPath}
        scopedNotes={scopedNotes}
        selectedNoteId={selectedNoteId}
        scanState={scanState}
        onSelectNote={selectNote}
      />
      <ActivePane
        notes={notes}
        folderOptions={folderOptions}
        selectedFolderPath={selectedFolderPath}
        selectedNoteId={selectedNoteId}
        noteEditBuffer={noteEditBuffer}
        editorLoadState={editorLoadState}
        editorNotice={editorNotice}
        onMoveSelectedNote={moveSelectedNote}
        onRenameSelectedFolder={renameSelectedFolder}
        onEditContent={editSelectedNoteContent}
        onSaveDraft={() => {
          void saveSelectedNoteDraft();
        }}
        onDiscardDraft={discardSelectedDraft}
      />
      <PathChangeQueue
        operations={pathChangeOperations}
        runningOperationIds={runningOperationIds}
        onClearCompletedOperations={clearCompletedPathChanges}
        onRunNextStep={(operationId) => {
          void runNextPathChangeStep(operationId);
        }}
        onRetryStep={retryPathChangeStep}
      />
    </section>
  );
}
