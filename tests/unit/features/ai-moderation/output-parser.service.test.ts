import { describe, expect, it } from "bun:test";
import {
  parseModelEvaluation,
  type ModerationCandidate,
  type ModerationPolicy,
} from "@/features/ai-moderation";

const JOB_POLICY: ModerationPolicy = {
  feature: "job-guard",
  allowedLabels: ["job_offer"],
  violationThreshold: 0.85,
  temporaryThreshold: 0.75,
  allowThreshold: 0.8,
  temporaryActionEnabled: false,
  primaryPromptVersion: "job-primary-v1",
  judgePromptVersion: "job-judge-v1",
};

const candidates: ModerationCandidate[] = [
  {
    index: 0,
    messageId: "m1",
    authorId: "u1",
    channelId: "c1",
    content: "Se   busca DEV, pago por proyecto",
    attachments: [],
  },
];

function violation(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    outcome: "violation",
    confidence: 0.93,
    targets: [
      {
        candidateIndex: 0,
        label: "job_offer",
        evidence: [{ quote: "se busca dev", policyTag: "hires_others" }],
      },
    ],
    reason: "Busca contratar a otra persona",
    ...overrides,
  });
}

describe("parseModelEvaluation", () => {
  it("parses a valid violation with normalized literal evidence", () => {
    expect(parseModelEvaluation(violation(), JOB_POLICY, candidates)).toEqual({
      status: "ok",
      evaluation: {
        outcome: "violation",
        confidence: 0.93,
        targets: [
          {
            candidateIndex: 0,
            label: "job_offer",
            evidence: [{ quote: "se busca dev", policyTag: "hires_others" }],
          },
        ],
        reason: "Busca contratar a otra persona",
      },
    });
  });

  it("parses a valid fenced allow with no targets", () => {
    const raw = `\`\`\`json
${JSON.stringify({
  outcome: "allow",
  confidence: 0.88,
  targets: [],
  reason: "No infringe la politica",
})}
\`\`\``;

    expect(parseModelEvaluation(raw, JOB_POLICY, candidates)).toEqual({
      status: "ok",
      evaluation: {
        outcome: "allow",
        confidence: 0.88,
        targets: [],
        reason: "No infringe la politica",
      },
    });
  });

  it("rejects malformed JSON", () => {
    expect(parseModelEvaluation("not JSON", JOB_POLICY, candidates).status).toBe(
      "invalid_output",
    );
  });

  it("rejects an invented candidate index", () => {
    const raw = violation({
      targets: [
        {
          candidateIndex: 42,
          label: "job_offer",
          evidence: [{ quote: "se busca dev", policyTag: "hires_others" }],
        },
      ],
    });

    expect(parseModelEvaluation(raw, JOB_POLICY, candidates).status).toBe(
      "invalid_output",
    );
  });

  it("rejects a label not allowed by the feature policy", () => {
    const raw = violation({
      targets: [
        {
          candidateIndex: 0,
          label: "malicious",
          evidence: [{ quote: "se busca dev", policyTag: "hires_others" }],
        },
      ],
    });

    expect(parseModelEvaluation(raw, JOB_POLICY, candidates).status).toBe(
      "invalid_output",
    );
  });

  it("rejects a violation target without evidence", () => {
    const raw = violation({
      targets: [{ candidateIndex: 0, label: "job_offer", evidence: [] }],
    });

    expect(parseModelEvaluation(raw, JOB_POLICY, candidates).status).toBe(
      "invalid_output",
    );
  });

  it("rejects nonliteral evidence", () => {
    const raw = violation({
      targets: [
        {
          candidateIndex: 0,
          label: "job_offer",
          evidence: [{ quote: "salario mensual", policyTag: "hires_others" }],
        },
      ],
    });

    expect(parseModelEvaluation(raw, JOB_POLICY, candidates).status).toBe(
      "invalid_output",
    );
  });

  it("rejects duplicate candidate and label targets", () => {
    const target = {
      candidateIndex: 0,
      label: "job_offer",
      evidence: [{ quote: "se busca dev", policyTag: "hires_others" }],
    };

    expect(
      parseModelEvaluation(
        violation({ targets: [target, target] }),
        JOB_POLICY,
        candidates,
      ).status,
    ).toBe("invalid_output");
  });

  it.each([-0.01, 1.01])("rejects out-of-range confidence %p", (confidence) => {
    expect(
      parseModelEvaluation(violation({ confidence }), JOB_POLICY, candidates).status,
    ).toBe("invalid_output");
  });

  it.each(["allow", "abstain"])(
    "rejects %s with non-empty targets",
    (outcome) => {
      expect(
        parseModelEvaluation(violation({ outcome }), JOB_POLICY, candidates).status,
      ).toBe("invalid_output");
    },
  );

  it("rejects a violation with no targets", () => {
    expect(
      parseModelEvaluation(violation({ targets: [] }), JOB_POLICY, candidates).status,
    ).toBe("invalid_output");
  });

  it.each([
    [null],
    [[]],
    [{ outcome: "allow", confidence: 0.9, targets: [] }],
    [{ outcome: "unknown", confidence: 0.9, targets: [], reason: "x" }],
  ])("rejects an invalid evaluation shape", (value) => {
    expect(
      parseModelEvaluation(JSON.stringify(value), JOB_POLICY, candidates).status,
    ).toBe("invalid_output");
  });
});
