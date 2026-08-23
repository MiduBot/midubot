import { describe, expect, it } from "bun:test";
import { es } from "@/i18n/es";
import type {
  EvaluationAttempt,
  ModerationCandidate,
} from "@/features/ai-moderation";
import {
  buildReviewCard,
  type ReviewCardInput,
} from "@/features/ai-moderation/services/review-card.service";

const ok = (label: "malicious" | "selfpromo"): EvaluationAttempt => ({
  status: "ok",
  evaluation: {
    outcome: "violation",
    confidence: label === "malicious" ? 0.95 : 0.91,
    targets: [{
      candidateIndex: 0,
      label,
      evidence: [{ quote: "vende @producto", policyTag: "scam" }],
    }],
    reason: "evidencia suficiente @staff",
  },
});

function makeInput(overrides: Partial<ReviewCardInput> = {}): ReviewCardInput {
  const candidate: ModerationCandidate["attachments"] = [
    { url: "https://cdn.test/first.png", name: "first.png", contentType: "image/png" },
    { url: "https://cdn.test/manual.pdf", name: "manual.pdf", contentType: "application/pdf" },
  ];
  return {
    targetId: 41,
    caseRef: "ai-mod:22",
    feature: "ai-mod",
    content: "Vendo @producto " + "x".repeat(3600),
    reportContent: "@staff revisen este mensaje",
    attachments: candidate,
    primary: ok("malicious"),
    judge: ok("malicious"),
    actionLabel: "Timeout 24h",
    pending: true,
    ...overrides,
  };
}

describe("buildReviewCard", () => {
  it("renders neutralized evidence, both evaluations, action, attachment metadata, and review buttons", () => {
    const result = buildReviewCard(makeInput(), es);
    const data = result.embed.toJSON();
    const fields = JSON.stringify(data.fields);
    const components = result.components.flatMap((row) => row.toJSON().components);

    expect(data.description).toContain("@\u200bproducto");
    expect(data.description).toContain("...[truncated]");
    expect(fields).toContain("@\u200bstaff revisen este mensaje");
    expect(fields).toContain("malicious");
    expect(fields).toContain("95%");
    expect(fields).toContain("vende @\u200bproducto");
    expect(fields).toContain("evidencia suficiente @\u200bstaff");
    expect(fields).toContain("Timeout 24h");
    expect(fields).toContain("first.png");
    expect(fields).toContain("manual.pdf");
    expect(data.footer?.text).toContain("ai-mod:22");
    expect(data.image?.url).toBe("https://cdn.test/first.png");
    expect(components.map((component) => component.custom_id)).toEqual([
      "modreview_41_confirm",
      "modreview_41_correct",
    ]);
  });

  it("omits review buttons for an already resolved or non-audit card", () => {
    const result = buildReviewCard(makeInput({ pending: false }), es);

    expect(result.components).toEqual([]);
  });

  it("shows image metadata without adding a second image preview", () => {
    const attachments = Array.from({ length: 3 }, (_, index) => ({
      url: `https://cdn.test/${index}.png`,
      name: `${index}.png`,
      contentType: "image/png",
    }));
    const result = buildReviewCard(makeInput({ attachments }), es);
    const data = result.embed.toJSON();

    expect(data.image?.url).toBe("https://cdn.test/0.png");
    expect(JSON.stringify(data.fields)).toContain("2.png");
  });
});
