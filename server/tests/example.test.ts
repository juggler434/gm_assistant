import { describe, it, expect } from "vitest";
import { ok, err, type Result } from "../src/types/index.js";

describe("Result type helpers", () => {
  it("ok() creates a success result", () => {
    const result: Result<number> = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err() creates an error result", () => {
    const result: Result<number, string> = err("something went wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("something went wrong");
    }
  });
});
