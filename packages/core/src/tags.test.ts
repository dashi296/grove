import { describe, expect, it } from "vitest";

import { parseMarkdownTags } from "./tags";

describe("parseMarkdownTags", () => {
  it("parses a single tag from content", () => {
    expect(parseMarkdownTags("Take notes about #project")).toStrictEqual(["project"]);
  });

  it("parses multiple tags and deduplicates them", () => {
    expect(parseMarkdownTags("Use #work and #work again, plus #personal")).toStrictEqual([
      "personal",
      "work",
    ]);
  });

  it("returns tags sorted alphabetically", () => {
    expect(parseMarkdownTags("#zebra and #apple and #mango")).toStrictEqual([
      "apple",
      "mango",
      "zebra",
    ]);
  });

  it("normalises tag case to lowercase", () => {
    expect(parseMarkdownTags("#Project #WORK")).toStrictEqual(["project", "work"]);
  });

  it("parses hyphenated tags", () => {
    expect(parseMarkdownTags("#long-term-goal")).toStrictEqual(["long-term-goal"]);
  });

  it("parses underscored tags", () => {
    expect(parseMarkdownTags("#to_do")).toStrictEqual(["to_do"]);
  });

  it("parses hierarchical tags with slashes", () => {
    expect(parseMarkdownTags("#work/meetings")).toStrictEqual(["work/meetings"]);
  });

  it("ignores hierarchical tags when a segment does not start with a letter", () => {
    expect(parseMarkdownTags("#work/2026 #project/-draft #area/")).toStrictEqual([]);
  });

  it("ignores tags inside fenced code blocks", () => {
    const content = "Before\n```\n#inside-block\n```\nAfter #outside";
    expect(parseMarkdownTags(content)).toStrictEqual(["outside"]);
  });

  it("ignores tags inside inline code spans", () => {
    expect(parseMarkdownTags("Use `#not-a-tag` but #real-tag")).toStrictEqual(["real-tag"]);
  });

  it("ignores tags inside multi-backtick inline code spans", () => {
    expect(parseMarkdownTags("Use ``#not-a-tag`` but #real-tag")).toStrictEqual(["real-tag"]);
  });

  it("ignores tags inside longer inline code spans that contain shorter backtick runs", () => {
    expect(parseMarkdownTags("Use `` `#not-a-tag` `` but #real-tag")).toStrictEqual(["real-tag"]);
  });

  it("ignores escaped hashes", () => {
    expect(parseMarkdownTags("Literal \\#not-a-tag but #real-tag")).toStrictEqual(["real-tag"]);
  });

  it("ignores heading lines", () => {
    expect(parseMarkdownTags("# Heading\n## Second\nActual #tag")).toStrictEqual(["tag"]);
  });

  it("ignores tags in heading lines indented with up to three spaces", () => {
    expect(parseMarkdownTags("   ### #heading-tag\nActual #tag")).toStrictEqual(["tag"]);
  });

  it("ignores tags inside indented code blocks", () => {
    expect(parseMarkdownTags("    #inside-code\nOutside #tag")).toStrictEqual(["tag"]);
  });

  it("ignores a hash not followed by a letter", () => {
    expect(parseMarkdownTags("#123 and #-nope")).toStrictEqual([]);
  });

  it("ignores a hash preceded by a word character", () => {
    expect(parseMarkdownTags("word#tag")).toStrictEqual([]);
  });

  it("ignores fragment identifiers inside bare URLs", () => {
    expect(
      parseMarkdownTags("Visit https://example.com/docs#overview and add #real-tag"),
    ).toStrictEqual(["real-tag"]);
  });

  it("ignores bare URL fragments after a slash", () => {
    expect(
      parseMarkdownTags("Visit https://example.com/#overview and add #real-tag"),
    ).toStrictEqual(["real-tag"]);
  });

  it("ignores fragment identifiers in Markdown links", () => {
    expect(parseMarkdownTags("See [Overview](#overview) before adding #real-tag")).toStrictEqual([
      "real-tag",
    ]);
  });

  it("ignores hash-prefixed link labels", () => {
    expect(parseMarkdownTags("Jump to [#overview](Plan.md) before adding #real-tag")).toStrictEqual(
      ["real-tag"],
    );
  });

  it("returns an empty array when content has no tags", () => {
    expect(parseMarkdownTags("Just plain text.")).toStrictEqual([]);
  });

  it("returns an empty array for empty content", () => {
    expect(parseMarkdownTags("")).toStrictEqual([]);
  });

  it("handles fenced blocks with language identifiers", () => {
    const content = "```typescript\n#not-a-tag\n```\n#real";
    expect(parseMarkdownTags(content)).toStrictEqual(["real"]);
  });

  it("ignores tags inside tilde fenced code blocks", () => {
    const content = "~~~\n#inside-tilde\n~~~\n#outside";
    expect(parseMarkdownTags(content)).toStrictEqual(["outside"]);
  });

  it("keeps ignoring tags until the matching fence closes", () => {
    const content = "~~~markdown\n```\n#inside-tilde\n~~~\n#outside";
    expect(parseMarkdownTags(content)).toStrictEqual(["outside"]);
  });

  it("does not close a fenced code block on a fence line with trailing info text", () => {
    const content = "```markdown\n```js\n#still-inside\n```\n#outside";
    expect(parseMarkdownTags(content)).toStrictEqual(["outside"]);
  });
});
