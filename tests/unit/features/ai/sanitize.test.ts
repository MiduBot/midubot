import { describe, it, expect } from "bun:test";
import {
  isChatbotNoReply,
  sanitizeChatbotOutput,
  isolateJokeGif,
} from "@/features/ai/services/sanitize";
import { CHATBOT_OUTPUT_MAX_CHARS } from "@/features/ai/constants";

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

  it("truncates long output", () => {
    const out = sanitizeChatbotOutput("a".repeat(CHATBOT_OUTPUT_MAX_CHARS + 50));
    expect(out.length).toBe(CHATBOT_OUTPUT_MAX_CHARS);
    expect(out.endsWith("…")).toBe(true);
  });

  it("closes a code fence when truncating inside it", () => {
    const out = sanitizeChatbotOutput(`\`\`\`ts\n${"a".repeat(2_000)}`);
    expect(out.length).toBe(CHATBOT_OUTPUT_MAX_CHARS);
    expect(out.endsWith("…\n```")).toBe(true);
  });

  it("returns only the gif URL when a configured joke gif is present", () => {
    const url = "https://tenor.com/view/who-is-he-gif";
    expect(
      isolateJokeGif(`jaja mira esto ${url} xd`, { whoIsHe: url }),
    ).toBe(url);
  });
});
