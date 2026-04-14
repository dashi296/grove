import { describe, expect, it } from "vitest";

import { createSyncStatus } from "./index";

describe("createSyncStatus", () => {
  it("returns disabled as the initial status", () => {
    expect(createSyncStatus()).toBe("disabled");
  });
});
