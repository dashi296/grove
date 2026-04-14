import { describe, expect, it } from "vitest";

import { createDatabasePlaceholder } from "./index";

describe("createDatabasePlaceholder", () => {
  it("returns idle as the initial database health", () => {
    expect(createDatabasePlaceholder()).toBe("idle");
  });
});
