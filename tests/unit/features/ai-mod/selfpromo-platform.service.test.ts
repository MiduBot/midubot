import { describe, expect, it } from "bun:test";
import { classifySelfpromoPlatform } from "@/features/ai-mod/services/selfpromo-platform.service";

describe("classifySelfpromoPlatform", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://jobs.linkedin.com/post", "linkedin"],
    ["https://WWW.X.COM/status/1", "x-instagram"],
    ["https://sub.instagram.com/p/1", "x-instagram"],
    ["https://example.com/portfolio", "other"],
  ] as const)("classifies %s as %s", (content, expected) => {
    expect(classifySelfpromoPlatform(content)).toBe(expected);
  });

  it("returns other for malformed or absent URLs", () => {
    expect(classifySelfpromoPlatform("watch my channel without a link")).toBe("other");
    expect(classifySelfpromoPlatform("https://[broken")).toBe("other");
  });
});
