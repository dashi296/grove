import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
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
  it("renders the path change queue in development mode", () => {
    const markup = renderToStaticMarkup(
      <FolderNavigationWorkspaceContent showPathChangeQueue={true} />,
    );

    expect(markup).toContain("Pending path changes");
    expect(markup).toContain("Path change queue");
    expect(markup).toContain("folder-navigation--with-queue");
  });

  it("hides the path change queue in production mode", () => {
    const markup = renderToStaticMarkup(
      <FolderNavigationWorkspaceContent showPathChangeQueue={false} />,
    );

    expect(markup).not.toContain("Pending path changes");
    expect(markup).not.toContain("Path change queue");
    expect(markup).toContain("folder-navigation--without-queue");
  });
});
