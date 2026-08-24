import { describe, expect, it } from "bun:test";
import { CHATBOT_SYSTEM_PROMPT } from "@/features/ai/constants";

describe("CHATBOT_SYSTEM_PROMPT", () => {
  it("contains the community rules and official source", () => {
    expect(CHATBOT_SYSTEM_PROMPT).toContain("https://midu.dev/");
    expect(CHATBOT_SYSTEM_PROMPT).toContain("comparte-links");
    expect(CHATBOT_SYSTEM_PROMPT).toContain("piratería");
    expect(CHATBOT_SYSTEM_PROMPT).toContain("otros Discords");
  });

  it("allows useful technical answers without granting moderation powers", () => {
    expect(CHATBOT_SYSTEM_PROMPT).toContain("duda técnica");
    expect(CHATBOT_SYSTEM_PROMPT).toContain("bloques de código");
    expect(CHATBOT_SYSTEM_PROMPT).toContain("No ejecutas sanciones");
  });

  it("prioritizes replies and recognizes topic changes", () => {
    expect(CHATBOT_SYSTEM_PROMPT).toContain('current="true"');
    expect(CHATBOT_SYSTEM_PROMPT).toContain('reply_to="id"');
    expect(CHATBOT_SYSTEM_PROMPT).toContain("cambia de tema");
    expect(CHATBOT_SYSTEM_PROMPT).toContain("no adivines");
    expect(CHATBOT_SYSTEM_PROMPT).toContain("[[NO_REPLY]]");
  });
});
