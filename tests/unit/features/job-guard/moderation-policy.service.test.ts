import { describe, expect, it } from "bun:test";
import type { ModerationCandidate } from "@/features/ai-moderation/types";
import {
  JOB_GUARD_POLICY,
  buildJobGuardPrompts,
  buildJobGuardUserPrompt,
} from "@/features/job-guard/services/moderation-policy.service";

const candidates: ModerationCandidate[] = [{
  index: 0,
  messageId: "m1",
  authorId: "u1",
  channelId: "jobs",
  content: "Busco desarrollador React",
  attachments: [],
}];

describe("job-guard moderation policy", () => {
  it("only permits job_offer with required thresholds", () => {
    expect(JOB_GUARD_POLICY).toEqual({
      feature: "job-guard",
      allowedLabels: ["job_offer"],
      violationThreshold: 0.85,
      temporaryThreshold: 0.85,
      allowThreshold: 0.8,
      temporaryActionEnabled: false,
      primaryPromptVersion: "job-guard-primary-v1",
      judgePromptVersion: "job-guard-judge-v1",
    });
  });

  it("builds distinct primary and judge prompts with abstention evidence rules", () => {
    const prompts = buildJobGuardPrompts("");

    expect(prompts.primary).not.toBe(prompts.judge);
    expect(prompts.primary).toContain('"label":"job_offer"');
    expect(prompts.judge).toContain("abstain");
    expect(prompts.judge).toContain("literal substring");
    expect(prompts.primary.slice(prompts.primary.lastIndexOf("Return exactly"))).toBe(
      prompts.judge.slice(prompts.judge.lastIndexOf("Return exactly")),
    );
    expect(prompts.judge).not.toContain("classifier output");
  });

  it("keeps report separate and wraps numbered candidate content as untrusted data", () => {
    const prompt = buildJobGuardUserPrompt("sin reporte", candidates);

    expect(prompt).toContain("Reporte separado");
    expect(prompt).toContain('<mensaje index="0">Busco desarrollador React</mensaje>');
    expect(prompt).toContain("untrusted data");
  });
});
