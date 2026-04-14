import { describe, expect, it } from "vitest";

import {
  buildFolderTree,
  getFolderPathForNote,
  isNoteInFolderScope,
  moveNoteToFolder,
  normalizeFolderPath,
  normalizeFolderScope,
  normalizeNoteFilePath,
  renameFolderInNotePath,
} from "./folders";

describe("folder path semantics", () => {
  it("normalizes workspace relative folder paths to slash-separated paths", () => {
    expect(normalizeFolderPath("Projects\\Grove//Research/")).toBe("Projects/Grove/Research");
  });

  it("rejects absolute and parent-traversing paths", () => {
    expect(() => normalizeFolderPath("/Projects")).toThrow("must not be absolute");
    expect(() => normalizeFolderPath("Projects/../Secrets")).toThrow("must not include dot");
    expect(() => normalizeFolderPath("C:\\Users\\Notes")).toThrow("must not include a drive");
    expect(() => normalizeFolderPath("C:Users\\Notes")).toThrow("must not include a drive");
  });

  it("uses null as the workspace root folder scope", () => {
    expect(normalizeFolderScope(null)).toBeNull();
    expect(normalizeFolderScope("")).toBeNull();
    expect(normalizeFolderScope("Projects")).toBe("Projects");
  });
});

describe("note file path semantics", () => {
  it("requires Markdown note file paths", () => {
    expect(normalizeNoteFilePath("Projects/Grove/Plan.MD")).toBe("Projects/Grove/Plan.MD");
    expect(() => normalizeNoteFilePath("Projects/Grove/Plan.txt")).toThrow("Markdown");
  });

  it("derives folder path from a note path", () => {
    expect(getFolderPathForNote(normalizeNoteFilePath("Inbox.md"))).toBeNull();
    expect(getFolderPathForNote(normalizeNoteFilePath("Projects/Grove/Plan.md"))).toBe(
      "Projects/Grove",
    );
  });

  it("filters note paths by root or descendant folder scope", () => {
    const notePath = normalizeNoteFilePath("Projects/Grove/Plan.md");

    expect(isNoteInFolderScope(notePath, null)).toBe(true);
    expect(isNoteInFolderScope(notePath, normalizeFolderPath("Projects"))).toBe(true);
    expect(isNoteInFolderScope(notePath, normalizeFolderPath("Archive"))).toBe(false);
  });

  it("moves note paths into a target folder scope", () => {
    const notePath = normalizeNoteFilePath("Projects/Grove/Plan.md");

    expect(moveNoteToFolder(notePath, normalizeFolderPath("Archive"))).toBe("Archive/Plan.md");
    expect(moveNoteToFolder(notePath, null)).toBe("Plan.md");
  });

  it("renames folder prefixes for descendant note paths only", () => {
    const notePath = normalizeNoteFilePath("Projects/Grove/Plan.md");

    expect(
      renameFolderInNotePath(
        notePath,
        normalizeFolderPath("Projects"),
        normalizeFolderPath("Areas"),
      ),
    ).toBe("Areas/Grove/Plan.md");
    expect(renameFolderInNotePath(notePath, normalizeFolderPath("Archive"), null)).toBe(notePath);
  });
});

describe("buildFolderTree", () => {
  it("includes explicit empty folders and aggregates descendant note counts", () => {
    const tree = buildFolderTree(
      [
        normalizeNoteFilePath("Projects/Grove/Plan.md"),
        normalizeNoteFilePath("Projects/Roadmap.md"),
        normalizeNoteFilePath("Archive/2026/Retro.md"),
        normalizeNoteFilePath("Inbox.md"),
      ],
      [normalizeFolderPath("Projects/Empty")],
    );

    expect(tree).toStrictEqual([
      {
        path: "Archive",
        name: "Archive",
        depth: 1,
        directNoteCount: 0,
        totalNoteCount: 1,
        children: [
          {
            path: "Archive/2026",
            name: "2026",
            depth: 2,
            directNoteCount: 1,
            totalNoteCount: 1,
            children: [],
          },
        ],
      },
      {
        path: "Projects",
        name: "Projects",
        depth: 1,
        directNoteCount: 1,
        totalNoteCount: 2,
        children: [
          {
            path: "Projects/Empty",
            name: "Empty",
            depth: 2,
            directNoteCount: 0,
            totalNoteCount: 0,
            children: [],
          },
          {
            path: "Projects/Grove",
            name: "Grove",
            depth: 2,
            directNoteCount: 1,
            totalNoteCount: 1,
            children: [],
          },
        ],
      },
    ]);
  });
});
