import {
  appName,
  buildFolderTree,
  getFolderDisplayName,
  getFolderPathForNote,
  isNoteInFolderScope,
  normalizeFolderPath,
  normalizeNoteFilePath,
} from "@grove/core";
import type { FolderScope, FolderTreeNode, NoteFilePath } from "@grove/core";
import { useMemo, useState } from "react";

import "./FolderNavigationWorkspace.css";

type NoteListItem = {
  id: string;
  title: string;
  path: NoteFilePath;
  updatedLabel: string;
};

type FolderNodeProps = {
  node: FolderTreeNode;
  selectedFolderPath: FolderScope;
  expandedFolderPaths: readonly string[];
  onSelect: (path: FolderScope) => void;
  onToggle: (path: string) => void;
};

type SidebarProps = {
  folderTree: readonly FolderTreeNode[];
  selectedFolderPath: FolderScope;
  expandedFolderPaths: readonly string[];
  onSelect: (path: FolderScope) => void;
  onToggle: (path: string) => void;
};

type NoteListProps = {
  selectedFolderPath: FolderScope;
  scopedNotes: readonly NoteListItem[];
};

const notes: readonly NoteListItem[] = [
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

const explicitFolders = [
  normalizeFolderPath("Projects/Grove/Ideas"),
  normalizeFolderPath("Reading"),
] as const;

function filterNotesByFolderScope(
  noteList: readonly NoteListItem[],
  selectedFolderPath: FolderScope,
): NoteListItem[] {
  return noteList.filter((note) => isNoteInFolderScope(note.path, selectedFolderPath));
}

function getFolderLabel(folderPath: FolderScope): string {
  return folderPath === null ? "Workspace" : getFolderDisplayName(folderPath);
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
        <span>{notes.length}</span>
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

function NoteList({ selectedFolderPath, scopedNotes }: NoteListProps) {
  return (
    <section className="folder-navigation__note-list" aria-label="Notes">
      <p className="folder-navigation__eyebrow">{getFolderLabel(selectedFolderPath)}</p>
      <h2 className="folder-navigation__heading">Notes</h2>
      {scopedNotes.length > 0 ? (
        <ol className="folder-navigation__notes">
          {scopedNotes.map((note) => (
            <li key={note.id} className="folder-navigation__note">
              <h3 className="folder-navigation__note-title">{note.title}</h3>
              <p className="folder-navigation__muted">
                {getFolderDisplayName(getFolderPathForNote(note.path))} · {note.updatedLabel}
              </p>
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

function ActivePane() {
  return (
    <section className="folder-navigation__pane">
      <p className="folder-navigation__eyebrow">Active pane</p>
      <h2 className="folder-navigation__heading">Workspace Plan</h2>
      <div className="folder-navigation__editor">
        <p>Keep the current draft open while moving through nearby project notes.</p>
      </div>
    </section>
  );
}

export function FolderNavigationWorkspace() {
  const [selectedFolderPath, setSelectedFolderPath] = useState<FolderScope>(null);
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<readonly string[]>([
    "Projects",
    "Projects/Grove",
  ]);

  const folderTree = useMemo(() => {
    return buildFolderTree(
      notes.map((note) => note.path),
      explicitFolders,
    );
  }, []);
  const scopedNotes = useMemo(() => {
    return filterNotesByFolderScope(notes, selectedFolderPath);
  }, [selectedFolderPath]);

  function toggleFolder(path: string): void {
    setExpandedFolderPaths((currentPaths) => {
      if (currentPaths.includes(path)) {
        return currentPaths.filter((currentPath) => currentPath !== path);
      }

      return [...currentPaths, path];
    });
  }

  return (
    <section className="folder-navigation">
      <Sidebar
        folderTree={folderTree}
        selectedFolderPath={selectedFolderPath}
        expandedFolderPaths={expandedFolderPaths}
        onSelect={setSelectedFolderPath}
        onToggle={toggleFolder}
      />
      <NoteList selectedFolderPath={selectedFolderPath} scopedNotes={scopedNotes} />
      <ActivePane />
    </section>
  );
}
