import { normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import { describe, expect, it } from "vitest";

import { createNewNotePath, insertCreatedNotePath } from "./noteCreation";

describe("createNewNotePath", () => {
  it("creates a Markdown path in the workspace root", () => {
    expect(createNewNotePath("Daily plan", null, [])).toBe("Daily plan.md");
  });

  it("creates a Markdown path in the selected folder", () => {
    expect(createNewNotePath("Project brief", normalizeFolderPath("Projects/Grove"), [])).toBe(
      "Projects/Grove/Project brief.md",
    );
  });

  it("falls back to Untitled and disambiguates collisions predictably", () => {
    expect(
      createNewNotePath(" / ", normalizeFolderPath("Projects/Grove"), [
        normalizeNoteFilePath("Projects/Grove/Untitled.md"),
        normalizeNoteFilePath("Projects/Grove/Untitled 2.md"),
      ]),
    ).toBe("Projects/Grove/Untitled 3.md");
  });

  it("removes invalid file name characters before creating the path", () => {
    expect(createNewNotePath("Roadmap: Q2/2026?", null, [])).toBe("Roadmap Q2 2026.md");
  });

  it("treats existing note paths as case-insensitive collisions", () => {
    expect(
      createNewNotePath("plan", normalizeFolderPath("Projects"), [
        normalizeNoteFilePath("Projects/Plan.md"),
      ]),
    ).toBe("Projects/plan 2.md");
  });
});

describe("insertCreatedNotePath", () => {
  it("keeps created note paths sorted with existing notes", () => {
    expect(
      insertCreatedNotePath(
        [normalizeNoteFilePath("Projects/Grove/Plan.md"), normalizeNoteFilePath("Inbox.md")],
        normalizeNoteFilePath("Projects/Grove/Brief.md"),
      ),
    ).toStrictEqual(["Inbox.md", "Projects/Grove/Brief.md", "Projects/Grove/Plan.md"]);
  });
});
