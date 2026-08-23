import { afterEach, describe, expect, it, mock } from "bun:test";

const mockEnv = { AI_MODEL: "evaluation-model" };
mock.module("@/config/env", () => ({ env: mockEnv }));

type Attempt =
  | {
      status: "ok";
      result: {
        text: string;
        model: string;
        latencyMs: number;
        inputTokens: number | null;
        outputTokens: number | null;
        finishReason: string;
      };
    }
  | { status: "timeout" | "provider_error"; error: string };

let attemptQueue: Attempt[] = [];
let chatMessagesAttemptImpl = async (): Promise<Attempt> => {
  const attempt = attemptQueue.shift();
  if (!attempt) throw new Error("missing mocked generation attempt");
  return attempt;
};
const chatMessagesAttemptMock = mock((...args: unknown[]) =>
  chatMessagesAttemptImpl(...args),
);
mock.module("@/features/ai-mod/services/ai-client.service", () => ({
  AIClientService: { chatMessagesAttempt: chatMessagesAttemptMock },
}));

import {
  evaluateDual,
  type DualEvaluationInput,
  type ModerationCandidate,
  type ModerationPolicy,
} from "@/features/ai-moderation";

const policy: ModerationPolicy = {
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
    content: "Se busca dev para proyecto",
    attachments: [],
  },
];

const baseInput: DualEvaluationInput = {
  candidates,
  policy,
  primarySystemPrompt: "PRIMARY_SYSTEM_PROMPT",
  judgeSystemPrompt: "JUDGE_SYSTEM_PROMPT",
  userPrompt: `Evaluate candidates: ${JSON.stringify(candidates)}`,
};

function generation(text: string, latencyMs = 12): Attempt {
  return {
    status: "ok",
    result: {
      text,
      model: "evaluation-model",
      latencyMs,
      inputTokens: 20,
      outputTokens: 8,
      finishReason: "stop",
    },
  };
}

function allow(reason = "No violation"): string {
  return JSON.stringify({ outcome: "allow", confidence: 0.9, targets: [], reason });
}

function violation(): string {
  return JSON.stringify({
    outcome: "violation",
    confidence: 0.93,
    targets: [
      {
        candidateIndex: 0,
        label: "job_offer",
        evidence: [{ quote: "Se busca dev", policyTag: "hires_others" }],
      },
    ],
    reason: "PRIMARY_REASON_SECRET",
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for test condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe("evaluateDual", () => {
  afterEach(() => {
    attemptQueue = [];
    chatMessagesAttemptImpl = async () => {
      const attempt = attemptQueue.shift();
      if (!attempt) throw new Error("missing mocked generation attempt");
      return attempt;
    };
    chatMessagesAttemptMock.mockClear?.();
  });

  it("runs two blind evaluations with identical user input and independent parsing", async () => {
    const primaryRaw = violation();
    attemptQueue = [generation(primaryRaw, 15), generation(allow(), 18)];

    const result = await evaluateDual(baseInput);

    expect(chatMessagesAttemptMock).toHaveBeenCalledTimes(2);
    const primaryCall = chatMessagesAttemptMock.mock.calls[0] as unknown[];
    const judgeCall = chatMessagesAttemptMock.mock.calls[1] as unknown[];
    expect(primaryCall[0]).not.toBe(judgeCall[0]);
    expect(primaryCall[1]).toEqual([{ role: "user", content: baseInput.userPrompt }]);
    expect(judgeCall[1]).toEqual(primaryCall[1]);
    expect(primaryCall[2]).toEqual({
      model: "evaluation-model",
      temperature: 0,
      timeoutMs: 180_000,
    });
    expect(judgeCall[2]).toEqual(primaryCall[2]);

    const judgePayload = JSON.stringify(judgeCall);
    expect(judgePayload).not.toContain(primaryRaw);
    expect(judgePayload).not.toContain("PRIMARY_REASON_SECRET");
    expect(result.primary.status).toBe("ok");
    expect(result.judge.status).toBe("ok");
    if (result.primary.status !== "ok" || result.judge.status !== "ok") {
      throw new Error("expected parsed evaluations");
    }
    expect(result.primary.evaluation.outcome).toBe("violation");
    expect(result.judge.evaluation.outcome).toBe("allow");
    expect(result.primaryGeneration?.latencyMs).toBe(15);
    expect(result.judgeGeneration?.latencyMs).toBe(18);
  });

  it("maps invalid JSON separately while preserving provider status", async () => {
    attemptQueue = [
      generation("not json"),
      { status: "provider_error", error: "provider unavailable" },
    ];

    const result = await evaluateDual(baseInput);

    expect(result.primary).toEqual({
      status: "invalid_output",
      error: "malformed_json",
    });
    expect(result.judge).toEqual({
      status: "provider_error",
      error: "provider unavailable",
    });
    expect(result.primaryGeneration?.text).toBe("not json");
    expect(result.judgeGeneration).toBeNull();
  });

  it("preserves timeout status with null generation metadata", async () => {
    attemptQueue = [
      { status: "timeout", error: "generation timed out" },
      generation(allow()),
    ];

    const result = await evaluateDual(baseInput);

    expect(result.primary).toEqual({
      status: "timeout",
      error: "generation timed out",
    });
    expect(result.primaryGeneration).toBeNull();
    expect(result.judge.status).toBe("ok");
    expect(result.judgeGeneration?.text).toBe(allow());
  });

  it("runs calls in parallel but serializes complete dual evaluations", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let activeCalls = 0;
    let maximumCalls = 0;
    const activeEvaluations = new Map<string, number>();
    let maximumEvaluations = 0;

    chatMessagesAttemptImpl = async (systemPrompt: unknown) => {
      const evaluation = String(systemPrompt).startsWith("first") ? "first" : "second";
      activeCalls++;
      maximumCalls = Math.max(maximumCalls, activeCalls);
      activeEvaluations.set(evaluation, (activeEvaluations.get(evaluation) ?? 0) + 1);
      maximumEvaluations = Math.max(maximumEvaluations, activeEvaluations.size);

      await (evaluation === "first" ? firstGate : secondGate);

      activeCalls--;
      const remaining = (activeEvaluations.get(evaluation) ?? 1) - 1;
      if (remaining === 0) activeEvaluations.delete(evaluation);
      else activeEvaluations.set(evaluation, remaining);
      return generation(allow());
    };

    const first = evaluateDual({
      ...baseInput,
      primarySystemPrompt: "first primary",
      judgeSystemPrompt: "first judge",
    });
    const second = evaluateDual({
      ...baseInput,
      primarySystemPrompt: "second primary",
      judgeSystemPrompt: "second judge",
    });

    await waitFor(() => chatMessagesAttemptMock.mock.calls.length === 2);
    expect(maximumCalls).toBe(2);
    expect(maximumEvaluations).toBe(1);
    expect(
      chatMessagesAttemptMock.mock.calls.map((call) => String(call[0])),
    ).toEqual(["first primary", "first judge"]);

    releaseFirst();
    await first;
    await waitFor(() => chatMessagesAttemptMock.mock.calls.length === 4);
    expect(maximumEvaluations).toBe(1);
    expect(
      chatMessagesAttemptMock.mock.calls.map((call) => String(call[0])),
    ).toEqual(["first primary", "first judge", "second primary", "second judge"]);

    releaseSecond();
    await second;
  });

  it("holds the queue until a rejected call's sibling settles", async () => {
    let releaseSibling!: () => void;
    const siblingGate = new Promise<void>((resolve) => {
      releaseSibling = resolve;
    });
    let markRejected!: () => void;
    const rejectionStarted = new Promise<void>((resolve) => {
      markRejected = resolve;
    });

    chatMessagesAttemptImpl = async (systemPrompt: unknown) => {
      switch (systemPrompt) {
        case "first primary":
          markRejected();
          throw new Error("unexpected primary rejection");
        case "first judge":
          await siblingGate;
          return generation(allow("first judge allow"));
        default:
          return generation(allow("second evaluation allow"));
      }
    };

    const first = evaluateDual({
      ...baseInput,
      primarySystemPrompt: "first primary",
      judgeSystemPrompt: "first judge",
    }).then(
      (result) => ({ status: "resolved" as const, result }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    const second = evaluateDual({
      ...baseInput,
      primarySystemPrompt: "second primary",
      judgeSystemPrompt: "second judge",
    });

    await rejectionStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));

    let outcomes:
      | [Awaited<typeof first>, Awaited<typeof second>]
      | undefined;
    try {
      expect(
        chatMessagesAttemptMock.mock.calls.map((call) => String(call[0])),
      ).toEqual(["first primary", "first judge"]);
    } finally {
      releaseSibling();
      outcomes = await Promise.all([first, second]);
    }

    const [firstOutcome, secondResult] = outcomes;
    expect(firstOutcome.status).toBe("resolved");
    if (firstOutcome.status !== "resolved") {
      throw new Error(`evaluateDual rejected: ${String(firstOutcome.error)}`);
    }
    expect(firstOutcome.result.primary).toEqual({
      status: "provider_error",
      error: "unexpected primary rejection",
    });
    expect(firstOutcome.result.primaryGeneration).toBeNull();
    expect(firstOutcome.result.judge.status).toBe("ok");
    expect(firstOutcome.result.judgeGeneration?.text).toBe(
      allow("first judge allow"),
    );
    expect(secondResult.primary.status).toBe("ok");
    expect(secondResult.judge.status).toBe("ok");
    expect(
      chatMessagesAttemptMock.mock.calls.map((call) => String(call[0])),
    ).toEqual(["first primary", "first judge", "second primary", "second judge"]);
  });
});
