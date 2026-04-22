import { describe, expect, it } from "vitest";

import { mapScannedMarkdownNotes } from "./workspaceScan";

describe("mapScannedMarkdownNotes", () => {
  it("normalizes scan results into folder navigation notes", () => {
    expect(
      mapScannedMarkdownNotes([
        {
          path: "Projects\\Grove//Plan.md",
          title: " Workspace plan ",
          content: "# Workspace plan",
          updatedAtUnixMs: Date.UTC(2026, 3, 15),
        },
      ]),
    ).toStrictEqual([
      {
        id: "Projects/Grove/Plan.md",
        path: "Projects/Grove/Plan.md",
        title: "Workspace plan",
        content: "# Workspace plan",
        tags: [],
        updatedLabel: "Apr 15",
      },
    ]);
  });

  it("derives tags from the scanned Markdown content", () => {
    const [result] = mapScannedMarkdownNotes([
      {
        path: "Inbox.md",
        title: "Inbox",
        content: "Review this #project and #work/meetings task.",
        updatedAtUnixMs: Date.UTC(2026, 3, 15),
      },
    ]);

    expect(result?.tags).toStrictEqual(["project", "work/meetings"]);
  });

  it("falls back to the file name when the scanned title is blank", () => {
    expect(
      mapScannedMarkdownNotes([
        {
          path: "Inbox.md",
          title: " ",
          content: "",
          updatedAtUnixMs: Date.UTC(2026, 0, 2),
        },
      ]),
    ).toMatchObject([
      {
        id: "Inbox.md",
        title: "Inbox",
        tags: [],
      },
    ]);
  });

  it("derives tags from scanned note content", () => {
    expect(
      mapScannedMarkdownNotes([
        {
          path: "Inbox.md",
          title: "Inbox",
          content: "Track #project and #project/grove.",
          updatedAtUnixMs: Date.UTC(2026, 0, 2),
        },
      ]),
    ).toMatchObject([
      {
        id: "Inbox.md",
        tags: ["project", "project/grove"],
      },
    ]);
  });

  it("rejects scan results that are not workspace-relative Markdown paths", () => {
    expect(() =>
      mapScannedMarkdownNotes([
        {
          path: "/Users/me/Notes/Plan.md",
          title: "Plan",
          content: "",
          updatedAtUnixMs: Date.UTC(2026, 3, 15),
        },
      ]),
    ).toThrow("absolute");
  });
});
