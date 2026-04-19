import { normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivePane,
  FolderNavigationWorkspaceContent,
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
        folderOptions={[
          { path: normalizeFolderPath("Projects/Grove"), label: "Projects/Grove" },
        ]}
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
