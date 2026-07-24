import { describe, it, expect, mock } from "bun:test";

mock.module("@/config/env", () => ({
  env: { LOG_LEVEL: "error" },
}));

import {
  normalizeText,
  containsImageUrl,
  extractImageUrls,
  safeDelete,
  safeTimeout,
} from "@/core/discord/moderation";
import { parseChannelId, parseUserId, parseRoleId } from "@/core/discord/formatters";
import { createMockMessage, createMockMember } from "../../mocks/discord";

describe("normalizeText", () => {
  it("lowercases and trims", () => {
    expect(normalizeText("  HELLO  ")).toBe("hello");
  });
});

describe("containsImageUrl", () => {
  it("detects image extensions", () => {
    expect(containsImageUrl("see https://x.com/i.png here")).toBe(true);
    expect(containsImageUrl("https://x.com/i.jpg")).toBe(true);
    expect(containsImageUrl("https://x.com/i.gif")).toBe(true);
    expect(containsImageUrl("https://x.com/i.webp")).toBe(true);
  });

  it("returns false for non-image", () => {
    expect(containsImageUrl("see https://x.com/i.txt")).toBe(false);
    expect(containsImageUrl("no link")).toBe(false);
  });
});

describe("extractImageUrls", () => {
  it("extracts image urls", () => {
    const r = extractImageUrls("a https://x.com/i.png b");
    expect(r).toContain("https://x.com/i.png");
  });

  it("returns empty for no images", () => {
    expect(extractImageUrls("no images")).toEqual([]);
  });

  it("strips trailing punctuation", () => {
    const r = extractImageUrls("https://x.com/i.png.");
    expect(r[0]).toBe("https://x.com/i.png");
  });

  it("strips trailing paren", () => {
    const r = extractImageUrls("(https://x.com/i.png)");
    expect(r[0]).toBe("https://x.com/i.png");
  });
});

describe("safeDelete", () => {
  it("deletes when deletable", async () => {
    const msg = createMockMessage({ deletable: true });
    const r = await safeDelete(msg);
    expect(r).toBe(true);
    expect(msg.delete).toHaveBeenCalled();
  });

  it("returns false when not deletable", async () => {
    const msg = createMockMessage({ deletable: false });
    const r = await safeDelete(msg);
    expect(r).toBe(false);
  });
});

describe("safeTimeout", () => {
  it("timeouts when moderatable", async () => {
    const member = createMockMember({ moderatable: true });
    const r = await safeTimeout(member, 1000);
    expect(r).toBe(true);
  });

  it("returns false when not moderatable", async () => {
    const member = createMockMember({ moderatable: false });
    const r = await safeTimeout(member, 1000);
    expect(r).toBe(false);
  });
});

describe("parseChannelId", () => {
  it("parses mention", () => {
    expect(parseChannelId("<#123456789012345678>")).toBe("123456789012345678");
  });

  it("parses raw id", () => {
    expect(parseChannelId("123456789012345678")).toBe("123456789012345678");
  });

  it("returns null for invalid", () => {
    expect(parseChannelId("abc")).toBeNull();
  });
});

describe("parseUserId", () => {
  it("parses mention", () => {
    expect(parseUserId("<@123456789012345678>")).toBe("123456789012345678");
  });

  it("parses nick mention", () => {
    expect(parseUserId("<@!123456789012345678>")).toBe("123456789012345678");
  });

  it("parses raw id", () => {
    expect(parseUserId("123456789012345678")).toBe("123456789012345678");
  });

  it("returns null for invalid", () => {
    expect(parseUserId("abc")).toBeNull();
  });
});

describe("parseRoleId", () => {
  it("parses mention", () => {
    expect(parseRoleId("<@&123456789012345678>")).toBe("123456789012345678");
  });

  it("parses raw id", () => {
    expect(parseRoleId("123456789012345678")).toBe("123456789012345678");
  });

  it("returns null for invalid", () => {
    expect(parseRoleId("abc")).toBeNull();
  });
});
