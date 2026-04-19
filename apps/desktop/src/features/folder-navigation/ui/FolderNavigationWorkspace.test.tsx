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
