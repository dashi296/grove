import { describe, expect, it } from "vitest";

import { dispatchMarkdownEditorCommand } from "./markdownEditor";

describe("dispatchMarkdownEditorCommand", () => {
  it("returns the next controlled value and restored selection", () => {
    expect(
      dispatchMarkdownEditorCommand({
        content: "Save often",
        selection: { start: 5, end: 10 },
        command: "bold",
      }),
    ).toEqual({
      content: "Save **often**",
      selection: { start: 7, end: 12 },
    });
  });
});
