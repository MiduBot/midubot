import { describe, it, expect } from "bun:test";
import {
  normalizeUrl,
  parseDuration,
  formatDuration,
  hashUrl,
} from "@/features/link-cooldown/services/link-cooldown.service";

describe("LinkCooldownService helpers", () => {
  describe("normalizeUrl", () => {
    it("lowercases the hostname", () => {
      expect(normalizeUrl("https://EXAMPLE.COM/path")).toBe(
        "https://example.com/path",
      );
    });

    it("removes tracking query parameters", () => {
      expect(
        normalizeUrl("https://example.com/page?utm_source=x&foo=bar"),
      ).toBe("https://example.com/page?foo=bar");
    });

    it("sorts remaining query parameters", () => {
      expect(normalizeUrl("https://example.com/page?z=1&a=2")).toBe(
        "https://example.com/page?a=2&z=1",
      );
    });

    it("removes trailing slash from pathname", () => {
      expect(normalizeUrl("https://example.com/path/")).toBe(
        "https://example.com/path",
      );
    });

    it("keeps root pathname intact", () => {
      expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
    });

    it("lowercases invalid URLs", () => {
      expect(normalizeUrl("NotAUrl")).toBe("notaurl");
    });
  });

  describe("parseDuration", () => {
    it("parses supported units", () => {
      expect(parseDuration("500ms")).toBe(500);
      expect(parseDuration("30s")).toBe(30_000);
      expect(parseDuration("5m")).toBe(300_000);
      expect(parseDuration("2h")).toBe(7_200_000);
      expect(parseDuration("1d")).toBe(86_400_000);
    });

    it("returns null for invalid input", () => {
      expect(parseDuration("foo")).toBeNull();
      expect(parseDuration("-5m")).toBeNull();
      expect(parseDuration("0s")).toBeNull();
    });
  });

  describe("formatDuration", () => {
    it("formats milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("formats seconds", () => {
      expect(formatDuration(30_000)).toBe("30s");
    });

    it("formats minutes", () => {
      expect(formatDuration(300_000)).toBe("5m");
    });

    it("formats hours", () => {
      expect(formatDuration(7_200_000)).toBe("2h");
    });

    it("formats days", () => {
      expect(formatDuration(172_800_000)).toBe("2d");
    });

    it("handles invalid or negative values", () => {
      expect(formatDuration(-1)).toBe("0ms");
      expect(formatDuration(NaN)).toBe("0ms");
    });
  });

  describe("hashUrl", () => {
    it("returns a deterministic sha256 hex digest", () => {
      const url = "https://example.com/page";
      const a = hashUrl(url);
      const b = hashUrl(url);
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it("normalizes the URL before hashing", () => {
      const a = hashUrl("https://example.com/page?utm_source=x");
      const b = hashUrl("https://example.com/page");
      expect(a).toBe(b);
    });
  });
});
