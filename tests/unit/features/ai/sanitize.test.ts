import { describe, it, expect } from "bun:test";
import {
  isChatbotNoReply,
  sanitizeChatbotOutput,
  isolateJokeGif,
  splitChatbotOutput,
} from "@/features/ai/services/sanitize";

describe("sanitizeChatbotOutput", () => {
  it("returns empty for blank input", () => {
    expect(sanitizeChatbotOutput("   ")).toBe("");
  });

  it("turns the ambient no-reply decision into an empty response", () => {
    expect(isChatbotNoReply("[[NO_REPLY]]")).toBe(true);
    expect(sanitizeChatbotOutput("[[NO_REPLY]]")).toBe("");
  });

  it("neutralizes @everyone and @here", () => {
    const out = sanitizeChatbotOutput("hola @everyone y @here");
    expect(out).not.toContain("@everyone");
    expect(out).not.toContain("@here");
    expect(out).toContain("everyone");
    expect(out).toContain("here");
  });

  it("strips role mentions", () => {
    expect(sanitizeChatbotOutput("mira <@&123456789012345678>")).toBe("mira");
  });

  it("strips Discord invite links", () => {
    const out = sanitizeChatbotOutput(
      "entra en https://discord.gg/ejemplo y discord.com/invite/otro",
    );
    expect(out).not.toContain("discord.gg");
    expect(out).not.toContain("discord.com/invite");
  });

  it("preserves long output and code formatting", () => {
    const text = `\`\`\`ts\n  ${"a".repeat(3_000)}\n\`\`\``;
    expect(sanitizeChatbotOutput(text)).toBe(text);
  });

  it("splits long output at natural boundaries without losing text", () => {
    const text = `${"palabra ".repeat(600)}fin`;
    const chunks = splitChatbotOutput(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(2_000);
  });

  it("closes and reopens code fences between messages", () => {
    const text = `antes\n\`\`\`ts\n${"const value = 1;\n".repeat(180)}\`\`\`\ndespués`;
    const chunks = splitChatbotOutput(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].endsWith("\n```")).toBe(true);
    expect(chunks[1].startsWith("```ts\n")).toBe(true);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(2_000);
  });

  it("returns only the gif URL when a configured joke gif is present", () => {
    const url = "https://tenor.com/view/who-is-he-gif";
    expect(
      isolateJokeGif(`jaja mira esto ${url} xd`, { whoIsHe: url }),
    ).toBe(url);
  });
});
