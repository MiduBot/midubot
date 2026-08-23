import { describe, expect, it } from "bun:test";
import {
  adjudicate,
  type AdjudicatedTarget,
  type EvaluationAttempt,
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

const AI_POLICY: ModerationPolicy = {
  feature: "ai-mod",
  allowedLabels: ["malicious", "selfpromo"],
  violationThreshold: 0.9,
  temporaryThreshold: 0.75,
  allowThreshold: 0.8,
  temporaryActionEnabled: true,
  primaryPromptVersion: "ai-primary-v1",
  judgePromptVersion: "ai-judge-v1",
};

function violation(
  confidence: number,
  targets: readonly AdjudicatedTarget[],
): EvaluationAttempt {
  return {
    status: "ok",
    evaluation: {
      outcome: "violation",
      confidence,
      targets: targets.map((target) => ({
        ...target,
        evidence: [{ quote: "evidence", policyTag: "test" }],
      })),
      reason: "test_violation",
    },
  };
}

function jobViolation(confidence: number, candidateIndex = 0): EvaluationAttempt {
  return violation(confidence, [{ candidateIndex, label: "job_offer" }]);
}

function scam(confidence: number, candidateIndex = 0): EvaluationAttempt {
  return violation(confidence, [{ candidateIndex, label: "malicious" }]);
}

function allow(confidence: number): EvaluationAttempt {
  return {
    status: "ok",
    evaluation: {
      outcome: "allow",
      confidence,
      targets: [],
      reason: "test_allow",
    },
  };
}

function abstain(confidence: number): EvaluationAttempt {
  return {
    status: "ok",
    evaluation: {
      outcome: "abstain",
      confidence,
      targets: [],
      reason: "test_abstain",
    },
  };
}

function failed(): EvaluationAttempt {
  return { status: "provider_error", error: "provider unavailable" };
}

describe("adjudicate", () => {
  const cases = [
    [
      "job agreement",
      JOB_POLICY,
      jobViolation(0.9),
      jobViolation(0.88),
      "auto_violation",
      "agreement_violation",
    ],
    [
      "job low agreement",
      JOB_POLICY,
      jobViolation(0.84),
      jobViolation(0.9),
      "review",
      "insufficient_agreement",
    ],
    [
      "allow agreement",
      JOB_POLICY,
      allow(0.85),
      allow(0.81),
      "auto_allow",
      "agreement_allow",
    ],
    [
      "allow low",
      JOB_POLICY,
      allow(0.79),
      allow(0.9),
      "review",
      "insufficient_agreement",
    ],
    [
      "ai temporary agreement",
      AI_POLICY,
      scam(0.8),
      scam(0.75),
      "temporary_action",
      "temporary_agreement",
    ],
    [
      "ai strong vs allow",
      AI_POLICY,
      scam(0.95),
      allow(0.9),
      "temporary_action",
      "single_strong_signal",
    ],
    [
      "conflicting targets",
      AI_POLICY,
      scam(0.95, 0),
      scam(0.95, 1),
      "review",
      "target_conflict",
    ],
    [
      "total failure",
      AI_POLICY,
      failed(),
      failed(),
      "technical_error",
      "technical_error",
    ],
  ] as const;

  it.each(cases)(
    "%s",
    (_name, policy, primary, judge, expectedKind, expectedReason) => {
      const result = adjudicate({ primary, judge, policy });

      expect(result.kind).toBe(expectedKind);
      expect(result.reason).toBe(expectedReason);
    },
  );

  it.each([
    ["violation", JOB_POLICY, jobViolation(0.85), jobViolation(0.85), "auto_violation"],
    ["allow", JOB_POLICY, allow(0.8), allow(0.8), "auto_allow"],
    ["temporary", AI_POLICY, scam(0.75), scam(0.75), "temporary_action"],
  ] as const)(
    "treats the %s threshold as inclusive",
    (_name, policy, primary, judge, expectedKind) => {
      expect(adjudicate({ primary, judge, policy }).kind).toBe(expectedKind);
    },
  );

  it("sorts and preserves every agreed target", () => {
    const first = violation(0.95, [
      { candidateIndex: 2, label: "selfpromo" },
      { candidateIndex: 0, label: "malicious" },
    ]);
    const second = violation(0.91, [
      { candidateIndex: 0, label: "malicious" },
      { candidateIndex: 2, label: "selfpromo" },
    ]);

    expect(adjudicate({ primary: first, judge: second, policy: AI_POLICY })).toEqual({
      kind: "auto_violation",
      targets: [
        { candidateIndex: 0, label: "malicious" },
        { candidateIndex: 2, label: "selfpromo" },
      ],
      reason: "agreement_violation",
    });
  });

  it("compares labels when targets share a candidate index", () => {
    const first = violation(0.95, [
      { candidateIndex: 0, label: "selfpromo" },
      { candidateIndex: 0, label: "malicious" },
    ]);
    const second = violation(0.95, [
      { candidateIndex: 0, label: "malicious" },
      { candidateIndex: 0, label: "selfpromo" },
    ]);

    expect(adjudicate({ primary: first, judge: second, policy: AI_POLICY }).kind).toBe(
      "auto_violation",
    );
  });

  it("uses a single strong signal when the other attempt fails", () => {
    expect(
      adjudicate({ primary: scam(0.9), judge: failed(), policy: AI_POLICY }),
    ).toEqual({
      kind: "temporary_action",
      targets: [{ candidateIndex: 0, label: "malicious" }],
      reason: "single_strong_signal",
    });
  });

  it("uses a single strong signal when the other attempt abstains", () => {
    expect(
      adjudicate({ primary: abstain(0.9), judge: scam(0.9), policy: AI_POLICY }).kind,
    ).toBe("temporary_action");
  });

  it("does not take a temporary action when the policy disables it", () => {
    expect(
      adjudicate({ primary: jobViolation(0.95), judge: allow(0.95), policy: JOB_POLICY }),
    ).toEqual({
      kind: "review",
      targets: [],
      reason: "insufficient_agreement",
    });
  });

  it("does not treat a multi-target violation as a single strong signal", () => {
    const primary = violation(0.95, [
      { candidateIndex: 0, label: "malicious" },
      { candidateIndex: 1, label: "selfpromo" },
    ]);

    expect(adjudicate({ primary, judge: allow(0.95), policy: AI_POLICY }).kind).toBe(
      "review",
    );
  });
});
