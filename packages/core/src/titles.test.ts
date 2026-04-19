import { describe, expect, it } from "vitest";

import { deriveNoteTitle, normalizeNoteFilePath, renameNoteFilePath } from "./index";

describe("deriveNoteTitle", () => {
  it("prefers a frontmatter title over other title sources", () => {
    expect(
      deriveNoteTitle(
        normalizeNoteFilePath("Projects/Grove/Plan.md"),
        ["---", 'title: "Roadmap"', "---", "# Plan"].join("\n"),
      ),
    ).toStrictEqual({
      title: "Roadmap",
      source: "frontmatter",
    });
  });

  it("uses the first H1 when frontmatter does not define a title", () => {
    expect(
      deriveNoteTitle(
        normalizeNoteFilePath("Projects/Grove/Plan.md"),
        ["## Context", "# Plan ###", "## Follow-up"].join("\n"),
      ),
    ).toStrictEqual({
      title: "Plan",
      source: "heading",
    });
  });

  it("falls back to the file stem when the content has no explicit title", () => {
    expect(deriveNoteTitle(normalizeNoteFilePath("Projects/Grove/Daily Plan.md"), "Body")).toStrictEqual({
      title: "Daily Plan",
      source: "file-stem",
    });
  });
});

describe("renameNoteFilePath", () => {
  it("renames a note inside its existing folder", () => {
    expect(
      renameNoteFilePath(normalizeNoteFilePath("Projects/Grove/Plan.md"), "Roadmap", []),
    ).toBe("Projects/Grove/Roadmap.md");
  });

  it("sanitizes the title before producing the next Markdown path", () => {
    expect(renameNoteFilePath(normalizeNoteFilePath("Inbox.md"), "Roadmap: Q2/2026?", [])).toBe(
      "Roadmap Q2 2026.md",
    );
  });

  it("rejects case-insensitive collisions with existing note paths", () => {
    expect(() =>
      renameNoteFilePath(normalizeNoteFilePath("Projects/Grove/Plan.md"), "Research", [
        normalizeNoteFilePath("Projects/Grove/research.md"),
      ]),
    ).toThrow("target Markdown path");
  });
});
