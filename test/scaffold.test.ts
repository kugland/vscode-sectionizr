import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("scaffolding", () => {
  it("ships no runtime dependencies", () => {
    expect((pkg as Record<string, unknown>).dependencies).toBeUndefined();
  });
});
