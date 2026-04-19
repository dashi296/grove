import { normalizeNoteFilePath } from "@grove/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivePane,
  FolderNavigationWorkspaceContent,
  getFolderNavigationWorkspaceClassName,
} from "./FolderNavigationWorkspace";

describe("getFolderNavigationWorkspaceClassName", () => {
  it("uses the four-column layout when the queue is visible", () => {
    expect(getFolderNavigationWorkspaceClassName(true)).toBe(
      "folder-navigation folder-navigation--with-queue",
    );
  });

  it("uses the three-column layout when the queue is hidden", () => {
    expect(getFolderNavigationWorkspaceClassName(false)).toBe(
      "folder-navigation folder-navigation--without-queue",
    );
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
    expect(markup).toContain("folder-navigation--without-queue");
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
    expect(markup).toContain("folder-navigation--with-queue");
  });

  it("hides both the queue and the diagnostics toggle in production mode", () => {
    const markup = renderToStaticMarkup(
      <FolderNavigationWorkspaceContent isDevelopmentMode={false} />,
    );

    expect(markup).not.toContain("Show path change diagnostics");
    expect(markup).not.toContain("Hide path change diagnostics");
    expect(markup).not.toContain("Pending path changes");
    expect(markup).not.toContain("Path change queue");
    expect(markup).toContain("folder-navigation--without-queue");
  });
});

describe("ActivePane", () => {
  it("shows resolved links, unresolved references, and backlinks in the note pane", () => {
    const markup = renderToStaticMarkup(
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
        folderOptions={[]}
        selectedFolderPath={null}
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
      />,
    );

    expect(markup).toContain("Links");
    expect(markup).toContain("Backlinks");
    expect(markup).toContain("Research");
    expect(markup).toContain("Untriaged -&gt; Missing");
    expect(markup).toContain("Review via Project plan");
    expect(markup).toContain("Unresolved");
  });
});
