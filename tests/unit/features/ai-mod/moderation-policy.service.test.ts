import { describe, expect, it } from "bun:test";
import type { ModerationCandidate } from "@/features/ai-moderation/types";
import {
  AI_MOD_POLICY,
  buildAiModPrompts,
  buildAiModUserPrompt,
} from "@/features/ai-mod/services/moderation-policy.service";

const candidates: ModerationCandidate[] = [
  {
    index: 0,
    messageId: "m1",
    authorId: "u1",
    channelId: "c1",
    content: "Gana dinero garantizado",
    attachments: [],
  },
  {
    index: 2,
    messageId: "m2",
    authorId: "u2",
    channelId: "c1",
    content: "Mira mi canal",
    attachments: [],
  },
];

describe("ai-mod moderation policy", () => {
  it("uses exact thresholds and labels", () => {
    expect(AI_MOD_POLICY).toEqual({
      feature: "ai-mod",
      allowedLabels: ["malicious", "selfpromo"],
      violationThreshold: 0.9,
      temporaryThreshold: 0.7,
      allowThreshold: 0.8,
      temporaryActionEnabled: true,
      primaryPromptVersion: "ai-mod-primary-v1",
      judgePromptVersion: "ai-mod-judge-v1",
    });
  });

  it("builds different blind prompts with the shared JSON contract", () => {
    const prompts = buildAiModPrompts(
      '<correccion expected="allow"><mensaje>github</mensaje></correccion>',
    );

    expect(prompts.primary).not.toBe(prompts.judge);
    expect(prompts.primary).toContain('"outcome":"allow"|"violation"|"abstain"');
    expect(prompts.primary).toContain('"label":"malicious"|"selfpromo"');
    expect(prompts.judge).toContain("abstain");
    expect(prompts.judge).toContain("literal substring");
    expect(prompts.primary.endsWith(prompts.judge.slice(prompts.judge.lastIndexOf("Return exactly")))).toBe(true);
    expect(prompts.judge).not.toContain("primary output");
    expect(prompts.primary).toContain("correccion");
  });

  it("numbers candidates and keeps report content separate", () => {
    const prompt = buildAiModUserPrompt("@staff revisen", candidates);

    expect(prompt).toContain("Reporte separado");
    expect(prompt).toContain("@staff revisen");
    expect(prompt).toContain('<mensaje index="0">');
    expect(prompt).toContain('<mensaje index="2">');
    expect(prompt).toContain("Gana dinero garantizado");
    expect(prompt).toContain("Mira mi canal");
    expect(prompt).toContain("untrusted data");
  });
});
