import { describe, expect, it } from "vitest";

import { parseTags } from "./index";

describe("parseTags", () => {
  it("parses Markdown tags and preserves first-seen order", () => {
    expect(parseTags("Track #project and #area/grove work.\nRepeat #project later.")).toStrictEqual(
      ["project", "area/grove"],
    );
  });

  it("ignores heading markers, fenced code blocks, and inline code", () => {
    expect(
      parseTags(
        [
          "# Project plan",
          "",
          "Use #active in prose.",
          "",
          "## Section #ignored-heading-tag",
          "",
          "```md",
          "#not-a-tag",
          "```",
          "",
          "Inline `#ignored-inline-tag` still stays code.",
        ].join("\n"),
      ),
    ).toStrictEqual(["active"]);
  });

  it("supports unicode and trims trailing slashes", () => {
    expect(parseTags("Coordinate #設計 and #project/grove/ while skipping #.")).toStrictEqual([
      "設計",
      "project/grove",
    ]);
  });
});
