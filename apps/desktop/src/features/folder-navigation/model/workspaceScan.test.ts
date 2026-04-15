import { describe, expect, it } from "vitest";

import { mapScannedMarkdownNotes } from "./workspaceScan";

describe("mapScannedMarkdownNotes", () => {
  it("normalizes scan results into folder navigation notes", () => {
    expect(
      mapScannedMarkdownNotes([
        {
          path: "Projects\\Grove//Plan.md",
          title: " Workspace plan ",
          updatedAtUnixMs: Date.UTC(2026, 3, 15),
        },
      ]),
    ).toStrictEqual([
      {
        id: "Projects/Grove/Plan.md",
        path: "Projects/Grove/Plan.md",
        title: "Workspace plan",
        updatedLabel: "Apr 15",
      },
    ]);
  });

  it("falls back to the file name when the scanned title is blank", () => {
    expect(
      mapScannedMarkdownNotes([
        {
          path: "Inbox.md",
          title: " ",
          updatedAtUnixMs: Date.UTC(2026, 0, 2),
        },
      ]),
    ).toMatchObject([
      {
        id: "Inbox.md",
        title: "Inbox",
      },
    ]);
  });

  it("rejects scan results that are not workspace-relative Markdown paths", () => {
    expect(() =>
      mapScannedMarkdownNotes([
        {
          path: "/Users/me/Notes/Plan.md",
          title: "Plan",
          updatedAtUnixMs: Date.UTC(2026, 3, 15),
        },
      ]),
    ).toThrow("absolute");
  });
});
