import { normalizeFolderScope, normalizeNoteFilePath } from "@grove/core";
import { describe, expect, it } from "vitest";

import { searchFolderNavigationNotes } from "./noteSearch";

const searchableNotes = [
  {
    id: "note-plan",
    title: "Workspace plan",
    path: normalizeNoteFilePath("Projects/Grove/Plan.md"),
    content: "# Workspace plan\nShip local search for desktop notes.",
    tags: [],
    updatedLabel: "Apr 18",
  },
  {
    id: "note-capture",
    title: "Capture ideas",
    path: normalizeNoteFilePath("Inbox/Capture.md"),
    content: "Quick thought about weekend errands.",
    tags: [],
    updatedLabel: "Apr 17",
  },
  {
    id: "note-archive",
    title: "Archived reference",
    path: normalizeNoteFilePath("Projects/Archive/Reference.md"),
    content: "Historical context only.",
    tags: [],
    updatedLabel: "Apr 10",
  },
] as const;

describe("searchFolderNavigationNotes", () => {
  it("matches note titles", () => {
    expect(
      searchFolderNavigationNotes({
        query: "workspace",
        notes: searchableNotes,
        selectedFolderPath: null,
        restrictToSelectedFolder: false,
      }).map((note) => note.id),
    ).toStrictEqual(["note-plan"]);
  });

  it("matches note content", () => {
    expect(
      searchFolderNavigationNotes({
        query: "weekend errands",
        notes: searchableNotes,
        selectedFolderPath: null,
        restrictToSelectedFolder: false,
      }).map((note) => note.id),
    ).toStrictEqual(["note-capture"]);
  });

  it("matches note paths", () => {
    expect(
      searchFolderNavigationNotes({
        query: "archive/reference",
        notes: searchableNotes,
        selectedFolderPath: null,
        restrictToSelectedFolder: false,
      }).map((note) => note.id),
    ).toStrictEqual(["note-archive"]);
  });

  it("filters results to the selected folder scope when requested", () => {
    expect(
      searchFolderNavigationNotes({
        query: "reference",
        notes: searchableNotes,
        selectedFolderPath: normalizeFolderScope("Projects/Grove"),
        restrictToSelectedFolder: true,
      }).map((note) => note.id),
    ).toStrictEqual([]);

    expect(
      searchFolderNavigationNotes({
        query: "plan",
        notes: searchableNotes,
        selectedFolderPath: normalizeFolderScope("Projects/Grove"),
        restrictToSelectedFolder: true,
      }).map((note) => note.id),
    ).toStrictEqual(["note-plan"]);
  });

  it("returns no results for a blank query", () => {
    expect(
      searchFolderNavigationNotes({
        query: "   ",
        notes: searchableNotes,
        selectedFolderPath: null,
        restrictToSelectedFolder: false,
      }),
    ).toStrictEqual([]);
  });
});
