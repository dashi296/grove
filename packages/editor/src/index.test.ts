import { describe, expect, it } from "vitest";

import { applyMarkdownCommand, createEditorMode, createMarkdownEditorAdapter } from "./index";

describe("createEditorMode", () => {
  it("returns markdown as the initial editor mode", () => {
    expect(createEditorMode()).toBe("markdown");
  });
});

describe("applyMarkdownCommand", () => {
  it("wraps selected text with bold markers", () => {
    expect(
      applyMarkdownCommand(
        {
          value: "Write notes",
          selection: { start: 6, end: 11 },
        },
        "bold",
      ),
    ).toEqual({
      value: "Write **notes**",
      selection: { start: 8, end: 13 },
    });
  });

  it("wraps selected text with italic markers", () => {
    expect(
      applyMarkdownCommand(
        {
          value: "plain text",
          selection: { start: 0, end: 5 },
        },
        "italic",
      ),
    ).toEqual({
      value: "*plain* text",
      selection: { start: 1, end: 6 },
    });
  });

  it("wraps selected text with inline code markers", () => {
    expect(
      applyMarkdownCommand(
        {
          value: "Use command",
          selection: { start: 4, end: 11 },
        },
        "code",
      ),
    ).toEqual({
      value: "Use `command`",
      selection: { start: 5, end: 12 },
    });
  });

  it("creates a Markdown link around selected text", () => {
    expect(
      applyMarkdownCommand(
        {
          value: "Grove docs",
          selection: { start: 0, end: 5 },
        },
        "link",
      ),
    ).toEqual({
      value: "[Grove]() docs",
      selection: { start: 1, end: 6 },
    });
  });

  it("adds an H1 marker to the active line", () => {
    expect(
      applyMarkdownCommand(
        {
          value: "Intro\nDaily note",
          selection: { start: 8, end: 13 },
        },
        "heading",
      ),
    ).toEqual({
      value: "Intro\n# Daily note",
      selection: { start: 10, end: 15 },
    });
  });

  it("normalizes an existing heading marker to H1", () => {
    expect(
      applyMarkdownCommand(
        {
          value: "### Daily note",
          selection: { start: 5, end: 10 },
        },
        "heading",
      ),
    ).toEqual({
      value: "# Daily note",
      selection: { start: 3, end: 8 },
    });
  });
});

describe("createMarkdownEditorAdapter", () => {
  it("keeps value and selection state while dispatching commands", () => {
    const adapter = createMarkdownEditorAdapter({
      value: "Draft",
      selection: { start: 0, end: 5 },
    });

    adapter.setValue("Draft note");
    adapter.setSelection({ start: 6, end: 10 });

    expect(adapter.dispatchCommand("bold")).toEqual({
      value: "Draft **note**",
      selection: { start: 8, end: 12 },
    });
    expect(adapter.getState()).toEqual({
      value: "Draft **note**",
      selection: { start: 8, end: 12 },
    });
  });
});
