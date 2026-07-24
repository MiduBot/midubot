import { describe, it, expect } from "bun:test";
import { UserFacingError } from "@/core/errors";

describe("UserFacingError", () => {
  it("carries a code and message", () => {
    const err = new UserFacingError("bad input", "INVALID");
    expect(err.message).toBe("bad input");
    expect(err.code).toBe("INVALID");
    expect(err.name).toBe("UserFacingError");
  });

  it("is an instance of Error", () => {
    const err = new UserFacingError("x", "y");
    expect(err).toBeInstanceOf(Error);
  });
});
