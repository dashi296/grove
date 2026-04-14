import { describe, expect, it } from "vitest";

import { createEditorMode } from "./index";

describe("createEditorMode", () => {
  it("returns markdown as the initial editor mode", () => {
    expect(createEditorMode()).toBe("markdown");
  });
});
