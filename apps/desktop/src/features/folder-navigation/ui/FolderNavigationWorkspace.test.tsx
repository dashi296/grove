import { buildFolderTree, normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivePane,
  FolderNavigationWorkspaceContent,
  NavigationPane,
  WorkspaceSwitcher,
  getFolderNavigationWorkspaceClassName,
} from "./FolderNavigationWorkspace";

describe("getFolderNavigationWorkspaceClassName", () => {
  it("keeps the same two-pane layout when the queue is visible", () => {
    expect(getFolderNavigationWorkspaceClassName(true)).toBe("folder-navigation");
  });

  it("keeps the same two-pane layout when the queue is hidden", () => {
    expect(getFolderNavigationWorkspaceClassName(false)).toBe("folder-navigation");
  });
});

describe("FolderNavigationWorkspaceContent", () => {
  it("hides the path change queue by default in development mode and shows the toggle", () => {
    const markup = renderToStaticMarkup(
      <FolderNavigationWorkspaceContent isDevelopmentMode={true} />,
    );

    expect(markup).toContain("Show path change diagnostics");
    expect(markup).not.toContain("Pending path changes");
    expect(markup).not.toContain("Path change queue");
    expect(markup).toContain("folder-navigation__navigation");
  });

  it("renders the path change queue when development diagnostics are expanded", () => {
    const markup = renderToStaticMarkup(
      <FolderNavigationWorkspaceContent
        isDevelopmentMode={true}
        initialPathChangeQueueVisibility={true}
      />,
    );

    expect(markup).toContain("Hide path change diagnostics");
    expect(markup).toContain("Pending path changes");
    expect(markup).toContain("Path change queue");
    expect(markup).toContain("folder-navigation__navigation");
  });

  it("hides both the queue and the diagnostics toggle in production mode", () => {
    const markup = renderToStaticMarkup(
      <FolderNavigationWorkspaceContent isDevelopmentMode={false} />,
    );

    expect(markup).not.toContain("Show path change diagnostics");
    expect(markup).not.toContain("Hide path change diagnostics");
    expect(markup).not.toContain("Pending path changes");
    expect(markup).not.toContain("Path change queue");
    expect(markup).toContain("folder-navigation__navigation");
  });
});

describe("NavigationPane", () => {
  const notes = [
    {
      id: "note-plan",
      path: normalizeNoteFilePath("Projects/Grove/Plan.md"),
      title: "Plan",
      content: "",
      updatedLabel: "Apr 19",
    },
    {
      id: "note-personal",
      path: normalizeNoteFilePath("Personal/Journal.md"),
      title: "Journal",
      content: "",
      updatedLabel: "Apr 18",
    },
  ];
  const selectedFolderPath = normalizeFolderPath("Projects/Grove");

  function renderNavigationPaneMarkup(
    overrides?: Partial<React.ComponentProps<typeof NavigationPane>>,
  ): string {
    return renderToStaticMarkup(
      <NavigationPane
        noteCount={notes.length}
        folderTree={buildFolderTree(
          notes.map((note) => note.path),
          [],
        )}
        selectedFolderPath={selectedFolderPath}
        expandedFolderPaths={[normalizeFolderPath("Projects"), selectedFolderPath]}
        onSelect={() => {}}
        onToggle={() => {}}
        scopedNotes={notes.filter((note) => note.path.startsWith("Projects/Grove/"))}
        selectedNoteId="note-plan"
        scanState={{ status: "ready", errorMessage: null }}
        createState={{ status: "idle", errorMessage: null }}
        createTitle=""
        onCreateTitleChange={() => {}}
        onCreateNote={() => {}}
        onSelectNote={() => {}}
        activeWorkspaceName=""
        recentWorkspaces={[]}
        switchBlockedReason={null}
        onSwitchWorkspace={() => Promise.resolve()}
        onAddWorkspace={() => Promise.resolve()}
        onRenameWorkspace={() => Promise.resolve()}
        onRemoveWorkspace={() => Promise.resolve()}
        {...overrides}
      />,
    );
  }

  it("renders Library and Notes as separate desktop navigation columns", () => {
    const markup = renderNavigationPaneMarkup();

    expect(markup).toContain("folder-navigation__library-column");
    expect(markup).toContain("folder-navigation__notes-column");
    expect(markup).toContain("All notes");
    expect(markup).toContain("Folders");
    expect(markup).toContain("Projects");
  });

  it("renders notes for the selected folder scope in the Notes column", () => {
    const markup = renderNavigationPaneMarkup();

    expect(markup).toContain("Grove");
    expect(markup).toContain("Plan");
    expect(markup).not.toContain("Journal");
  });

  it("places the workspace switcher in the Library column", () => {
    const markup = renderNavigationPaneMarkup({
      activeWorkspaceName: "Personal Notes",
      recentWorkspaces: [],
      switchBlockedReason: null,
      onSwitchWorkspace: () => Promise.resolve(),
      onAddWorkspace: () => Promise.resolve(),
      onRenameWorkspace: () => Promise.resolve(),
      onRemoveWorkspace: () => Promise.resolve(),
    });

    expect(markup).toContain("folder-navigation__workspace-switcher");
    expect(markup).toContain("Personal Notes");
    expect(markup).toContain("Switch workspace");
  });
});

describe("WorkspaceSwitcher", () => {
  const baseWorkspaceSwitcherProps = {
    activeWorkspaceName: "Personal Notes",
    recentWorkspaces: [] as { id: string; name: string; rootPath: string; lastOpenedAtUnixMs: number }[],
    switchBlockedReason: null as string | null,
    onSwitchWorkspace: () => Promise.resolve(),
    onAddWorkspace: () => Promise.resolve(),
    onRenameWorkspace: () => Promise.resolve(),
    onRemoveWorkspace: () => Promise.resolve(),
  };

  it("connects the trigger to the workspace popover for assistive technology", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSwitcher {...baseWorkspaceSwitcherProps} initiallyOpen={true} />,
    );
    const controlsMatch = markup.match(/aria-controls="([^"]+)"/);
    const idMatch = markup.match(/id="([^"]+)"/);

    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('role="dialog"');
    expect(controlsMatch?.[1]).toBe(idMatch?.[1]);
  });

  it("uses unique popover ids when more than one switcher is rendered", () => {
    const markup = renderToStaticMarkup(
      <>
        <WorkspaceSwitcher {...baseWorkspaceSwitcherProps} initiallyOpen={true} />
        <WorkspaceSwitcher
          {...baseWorkspaceSwitcherProps}
          activeWorkspaceName="Archive"
          initiallyOpen={true}
        />
      </>,
    );

    const popoverIds = Array.from(markup.matchAll(/id="([^"]+)"/g), (match) => match[1]);

    expect(popoverIds).toHaveLength(2);
    expect(new Set(popoverIds).size).toBe(2);
  });

  it("opens a lightweight popover with workspace actions and no sync copy", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSwitcher
        {...baseWorkspaceSwitcherProps}
        recentWorkspaces={[
          { id: "ws-research", name: "Research", rootPath: "/notes/research", lastOpenedAtUnixMs: 2000 },
          { id: "ws-archive", name: "Archive", rootPath: "/notes/archive", lastOpenedAtUnixMs: 1000 },
        ]}
        initiallyOpen={true}
      />,
    );

    expect(markup).toContain("Current workspace");
    expect(markup).toContain("Research");
    expect(markup).toContain("Archive");
    expect(markup).toContain("Add workspace");
    expect(markup).toContain("Workspace settings");
    expect(markup).not.toContain("Synced");
    expect(markup).not.toContain("Sync status");
    expect(markup).not.toContain("Cloud status");
  });

  it("shows the switch blocked reason when note edits are dirty", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSwitcher
        {...baseWorkspaceSwitcherProps}
        switchBlockedReason="Save or discard the current draft before switching workspaces."
        recentWorkspaces={[
          { id: "ws-b", name: "Work Notes", rootPath: "/notes/work", lastOpenedAtUnixMs: 1000 },
        ]}
        initiallyOpen={true}
      />,
    );

    expect(markup).toContain("Save or discard the current draft before switching workspaces.");
  });

  it("renders the active workspace name from props", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSwitcher {...baseWorkspaceSwitcherProps} activeWorkspaceName="My Research" />,
    );

    expect(markup).toContain("My Research");
  });
});

describe("ActivePane", () => {
  function renderActivePaneMarkup(
    overrides?: Partial<React.ComponentProps<typeof ActivePane>>,
  ): string {
    return renderToStaticMarkup(
      <ActivePane
        notes={[
          {
            id: "note-plan",
            path: normalizeNoteFilePath("Projects/Grove/Plan.md"),
            title: "Plan",
            content: "[[Research]] [[Missing|Untriaged]]",
            updatedLabel: "Apr 19",
          },
        ]}
        folderOptions={[{ path: normalizeFolderPath("Projects/Grove"), label: "Projects/Grove" }]}
        selectedFolderPath={normalizeFolderPath("Projects/Grove")}
        selectedNoteId="note-plan"
        noteEditBuffer={null}
        editorLoadState={{ status: "idle" }}
        editorNotice={null}
        deleteState={{ status: "idle", errorMessage: null }}
        onMoveSelectedNote={() => {
          throw new Error("not implemented in test");
        }}
        onRenameSelectedFolder={() => {
          throw new Error("not implemented in test");
        }}
        onEditContent={() => {}}
        onSaveDraft={() => {}}
        saveBlockedReason={null}
        onDiscardDraft={() => {}}
        deleteBlockedReason={null}
        onDeleteSelectedNote={() => {}}
        isDevelopmentMode={false}
        isPathChangeQueueVisible={false}
        onTogglePathChangeQueue={() => {}}
        pathChangeOperations={[]}
        runningOperationIds={[]}
        onClearCompletedOperations={() => {}}
        onRunNextStep={() => {}}
        onRetryStep={() => {}}
        selectedNoteLinks={[
          {
            target: "Research",
            alias: null,
            fromId: "note-plan",
            toId: "note-research",
            isResolved: true,
          },
          {
            target: "Missing",
            alias: "Untriaged",
            fromId: "note-plan",
            toId: null,
            isResolved: false,
          },
        ]}
        selectedNoteBacklinks={[
          {
            target: "Plan",
            alias: "Project plan",
            fromId: "note-review",
            toId: "note-plan",
            isResolved: true,
          },
        ]}
        noteTitlesById={
          new Map([
            ["note-plan", "Plan"],
            ["note-research", "Research"],
            ["note-review", "Review"],
          ])
        }
        {...overrides}
      />,
    );
  }

  it("shows resolved links, unresolved references, and backlinks in the note pane", () => {
    const markup = renderActivePaneMarkup({ initialDetailsOpen: true });

    expect(markup).toContain("Links");
    expect(markup).toContain("Backlinks");
    expect(markup).toContain("Path");
    expect(markup).toContain("Research");
    expect(markup).toContain("Untriaged -&gt; Missing");
    expect(markup).toContain("Review via Project plan");
    expect(markup).toContain("Unresolved");
  });

  it("hides path, links, and backlinks by default", () => {
    const markup = renderActivePaneMarkup();

    expect(markup).toContain("Details");
    expect(markup).not.toContain("Path");
    expect(markup).not.toContain("Links");
    expect(markup).not.toContain("Backlinks");
  });

  it("hides move, rename, and delete controls by default", () => {
    const markup = renderActivePaneMarkup();

    expect(markup).toContain("Note actions");
    expect(markup).toContain("Folder actions");
    expect(markup).not.toContain("Move selected note");
    expect(markup).not.toContain("Rename selected folder");
    expect(markup).not.toContain("Delete note");
  });

  it("shows note actions when the note disclosure starts open", () => {
    const markup = renderActivePaneMarkup({ initialNoteActionsOpen: true });

    expect(markup).toContain("Move selected note");
    expect(markup).toContain("Delete note");
    expect(markup).toContain(
      "Path changes refresh the folder tree and note list immediately. File and index work runs in the background.",
    );
  });

  it("shows folder actions when the folder disclosure starts open", () => {
    const markup = renderActivePaneMarkup({ initialFolderActionsOpen: true });

    expect(markup).toContain("Rename selected folder");
    expect(markup).toContain(
      "Path changes refresh the folder tree and note list immediately. File and index work runs in the background.",
    );
  });

  it("hides note actions entirely when no note is selected", () => {
    const markup = renderActivePaneMarkup({
      notes: [],
      folderOptions: [],
      selectedFolderPath: null,
      selectedNoteId: "",
      selectedNoteLinks: [],
      selectedNoteBacklinks: [],
      noteTitlesById: new Map(),
    });

    expect(markup).not.toContain("Note actions");
    expect(markup).not.toContain("Details");
    expect(markup).toContain("Folder actions");
  });
});
