import {
  appName,
  buildFolderTree,
  getFolderDisplayName,
  getFolderPathForNote,
  isNoteInFolderScope,
  normalizeFolderPath,
  normalizeFolderScope,
  normalizeNoteFilePath,
} from "@grove/core";
import type { FolderScope, FolderTreeNode } from "@grove/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createPathChangeOperation,
  getFailedOperationSteps,
  getNextPendingOperationStep,
  isDescendantFolderPath,
  isPathChangeOperationComplete,
  moveNoteInFolderWorkspace,
  reconcileFolderWorkspaceState,
  renameFolderInWorkspace,
  retryOperationStep,
  runNextOperationStep,
} from "../model/folderWorkspaceState";
import { createDesktopPathChangeExecutor } from "../model/folderPathChangeExecutor";
import type {
  FolderNavigationNote,
  FolderWorkspaceMutation,
  FolderWorkspaceOperationStepId,
  FolderWorkspaceOperationStep,
  FolderWorkspacePathChange,
  FolderWorkspacePathChangeOperation,
  FolderWorkspaceState,
} from "../model/folderWorkspaceState";
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
  onMoveSelectedNote: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
  onRenameSelectedFolder: (targetFolderPath: FolderScope) => FolderWorkspaceMutation;
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
  onRunNextStep: (operationId: string) => void;
  onRetryStep: (operationId: string, stepId: FolderWorkspaceOperationStepId) => void;
};

const initialNotes: readonly NoteListItem[] = [
  {
    id: "note-inbox",
    title: "Daily capture",
    path: normalizeNoteFilePath("Inbox.md"),
    updatedLabel: "Today",
  },
  {
    id: "note-plan",
    title: "Grove workspace plan",
    path: normalizeNoteFilePath("Projects/Grove/Workspace Plan.md"),
    updatedLabel: "Yesterday",
  },
  {
    id: "note-research",
    title: "Folder navigation notes",
    path: normalizeNoteFilePath("Projects/Grove/Research/Folder Navigation.md"),
    updatedLabel: "Apr 12",
  },
  {
    id: "note-sync",
    title: "Sync provider questions",
    path: normalizeNoteFilePath("Projects/Sync/Provider Questions.md"),
    updatedLabel: "Apr 10",
  },
  {
    id: "note-archive",
    title: "Launch retrospective",
    path: normalizeNoteFilePath("Archive/2026/Launch Retro.md"),
    updatedLabel: "Apr 8",
  },
];

const initialExplicitFolders = [
  normalizeFolderPath("Projects/Grove/Ideas"),
  normalizeFolderPath("Reading"),
] as const;

const disconnectedPathChangeGatewayMessage =
  "Desktop local file and index gateways are not connected yet.";

const desktopPathChangeExecutor = createDesktopPathChangeExecutor({
  fileGateway: {
    async moveMarkdownFile() {
      throw new Error(disconnectedPathChangeGatewayMessage);
    },
  },
  indexGateway: {
    async refreshNoteIndexes() {
      throw new Error(disconnectedPathChangeGatewayMessage);
    },
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
  onSelectNote,
}: NoteListProps) {
  return (
    <section className="folder-navigation__note-list" aria-label="Notes">
      <p className="folder-navigation__eyebrow">{getFolderLabel(selectedFolderPath)}</p>
      <h2 className="folder-navigation__heading">Notes</h2>
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
        <div className="folder-navigation__empty">
          <h3 className="folder-navigation__note-title">No notes here yet</h3>
          <p className="folder-navigation__muted">Start in {getFolderLabel(selectedFolderPath)}.</p>
        </div>
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

function ActivePane({
  notes,
  folderOptions,
  selectedFolderPath,
  selectedNoteId,
  onMoveSelectedNote,
  onRenameSelectedFolder,
}: ActivePaneProps) {
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0];
  const [operationMessage, setOperationMessage] = useState<string>(
    "Path changes refresh the folder tree and note list immediately.",
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
  onRunNextStep,
  onRetryStep,
}: PathChangeQueueProps) {
  return (
    <section className="folder-navigation__queue" aria-label="Pending path changes">
      <p className="folder-navigation__eyebrow">Local operations</p>
      <h2 className="folder-navigation__heading">Path change queue</h2>
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
  const [workspaceState, setWorkspaceState] = useState<FolderWorkspaceState>({
    notes: initialNotes,
    explicitFolders: initialExplicitFolders,
    selectedFolderPath: null,
    expandedFolderPaths: ["Projects", "Projects/Grove"],
  });
  const [selectedNoteId, setSelectedNoteId] = useState<string>(initialNotes[1]?.id ?? "");
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
        onSelectNote={setSelectedNoteId}
      />
      <ActivePane
        notes={notes}
        folderOptions={folderOptions}
        selectedFolderPath={selectedFolderPath}
        selectedNoteId={selectedNoteId}
        onMoveSelectedNote={moveSelectedNote}
        onRenameSelectedFolder={renameSelectedFolder}
      />
      <PathChangeQueue
        operations={pathChangeOperations}
        runningOperationIds={runningOperationIds}
        onRunNextStep={(operationId) => {
          void runNextPathChangeStep(operationId);
        }}
        onRetryStep={retryPathChangeStep}
      />
    </section>
  );
}
