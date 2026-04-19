import { describe, expect, it } from "vitest";

import { parseWikiLinks, resolveWikiLinks } from "./index";

describe("parseWikiLinks", () => {
  it("parses plain and aliased WikiLinks from Markdown content", () => {
    expect(parseWikiLinks("See [[Plan]] and [[Project Roadmap|Roadmap]].")).toStrictEqual([
      {
        target: "Plan",
        alias: null,
      },
      {
        target: "Project Roadmap",
        alias: "Roadmap",
      },
    ]);
  });

  it("ignores empty WikiLink targets", () => {
    expect(parseWikiLinks("[[]] [[ | Alias ]] [[Plan| ]]")).toStrictEqual([
      {
        target: "Plan",
        alias: null,
      },
    ]);
  });
});

describe("resolveWikiLinks", () => {
  it("resolves outgoing links and derives backlinks", () => {
    const resolved = resolveWikiLinks([
      {
        id: "note-plan",
        title: "Plan",
        content: "Links to [[Research]] and [[Unknown]].",
      },
      {
        id: "note-research",
        title: "Research",
        content: "See [[Plan|the plan]].",
      },
    ]);

    expect(resolved).toStrictEqual([
      {
        noteId: "note-plan",
        links: [
          {
            target: "Research",
            alias: null,
            fromId: "note-plan",
            toId: "note-research",
            isResolved: true,
          },
          {
            target: "Unknown",
            alias: null,
            fromId: "note-plan",
            toId: null,
            isResolved: false,
          },
        ],
        backlinks: [
          {
            target: "Plan",
            alias: "the plan",
            fromId: "note-research",
            toId: "note-plan",
            isResolved: true,
          },
        ],
      },
      {
        noteId: "note-research",
        links: [
          {
            target: "Plan",
            alias: "the plan",
            fromId: "note-research",
            toId: "note-plan",
            isResolved: true,
          },
        ],
        backlinks: [
          {
            target: "Research",
            alias: null,
            fromId: "note-plan",
            toId: "note-research",
            isResolved: true,
          },
        ],
      },
    ]);
  });

  it("resolves duplicate titles predictably by keeping the first matching note", () => {
    const [firstNote, secondNote, linkSource] = resolveWikiLinks([
      {
        id: "note-plan-a",
        title: "Plan",
        content: "",
      },
      {
        id: "note-plan-b",
        title: "Plan",
        content: "",
      },
      {
        id: "note-source",
        title: "Source",
        content: "[[Plan]]",
      },
    ]);

    expect(firstNote.backlinks).toHaveLength(1);
    expect(firstNote.backlinks[0]?.fromId).toBe("note-source");
    expect(secondNote.backlinks).toHaveLength(0);
    expect(linkSource.links[0]?.toId).toBe("note-plan-a");
  });

  it("keeps unresolved links visible without crashing resolution", () => {
    expect(
      resolveWikiLinks([
        {
          id: "note-plan",
          title: "Plan",
          content: "[[Missing]]",
        },
      ]),
    ).toStrictEqual([
      {
        noteId: "note-plan",
        links: [
          {
            target: "Missing",
            alias: null,
            fromId: "note-plan",
            toId: null,
            isResolved: false,
          },
        ],
        backlinks: [],
      },
    ]);
  });
});
