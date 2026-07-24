import { describe, it, expect } from "bun:test";
import { extractUrls, extractUrlsFromMessage } from "@/features/link-cooldown/utils/extract-urls";
import { createMockMessage } from "../../mocks/discord";

describe("extractUrls", () => {
  it("extracts simple urls", () => {
    expect(extractUrls("see https://example.com here")).toEqual([
      "https://example.com",
    ]);
  });

  it("strips trailing punctuation", () => {
    expect(extractUrls("https://example.com.")).toEqual(["https://example.com"]);
    expect(extractUrls("https://example.com,")).toEqual(["https://example.com"]);
  });

  it("returns empty for no urls", () => {
    expect(extractUrls("no links")).toEqual([]);
  });

  it("extracts multiple urls", () => {
    const r = extractUrls("a https://a.com b https://b.com");
    expect(r).toEqual(["https://a.com", "https://b.com"]);
  });
});

describe("extractUrlsFromMessage", () => {
  it("extracts from content", () => {
    const msg = createMockMessage({ content: "see https://x.com" });
    const r = extractUrlsFromMessage(msg);
    expect(r).toContain("https://x.com");
  });

  it("extracts from embeds", () => {
    const msg = createMockMessage({
      embeds: [
        {
          url: "https://embed.com",
          title: "title https://title.com",
          description: "desc https://desc.com",
          fields: [{ name: "n https://field.com", value: "v" }],
        },
      ],
    });
    const r = extractUrlsFromMessage(msg);
    expect(r).toContain("https://embed.com");
    expect(r).toContain("https://title.com");
    expect(r).toContain("https://desc.com");
    expect(r).toContain("https://field.com");
  });

  it("deduplicates", () => {
    const msg = createMockMessage({
      content: "https://x.com",
      embeds: [
        { url: "https://x.com", fields: [] },
      ],
    });
    const r = extractUrlsFromMessage(msg);
    expect(r.filter((u) => u === "https://x.com")).toHaveLength(1);
  });
});
