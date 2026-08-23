import { describe, it, expect, beforeEach, mock } from "bun:test";
import { ChannelType } from "discord.js";
import { createMockMessage } from "../../../mocks/discord";

// Env: feature enabled, target channel = "chan-1".
// Store as mutable object so we can override per-test for feature-disabled case.
const mockEnv = {
  AI_API_URL: "https://ai.test/v1/chat/completions",
  AI_API_KEY: "test-key",
  AI_MODEL: "deepseek-v4-flash",
  JOB_CHANNEL_ID: "chan-1",
};

mock.module("@/features/language", () => ({
  LanguageService: { getLanguage: mock(async () => "es") },
}));

mock.module("@/config/env", () => ({
  env: mockEnv,
}));

// Controllable legacy classifier used only by shadow mode.
const classifyMock = mock(async () => ({ ok: false }) as { ok: boolean });
mock.module("@/features/job-guard/services/classifier.service", () => ({
  classify: classifyMock,
}));

const insertCaseMock = mock(async () => 7);
mock.module("@/features/job-guard/services/cases.service", () => ({
  JobGuardCasesService: { insert: insertCaseMock },
}));

const getLogChannelMock = mock(async (): Promise<string | null> => null);
mock.module("@/features/log-channel", () => ({
  LogChannelService: { getLogChannel: getLogChannelMock },
}));

const evaluateDualMock = mock(async () => ({
  primary: {
    status: "ok",
    evaluation: {
      outcome: "violation",
      confidence: 0.95,
      targets: [{ candidateIndex: 0, label: "job_offer", evidence: [] }],
      reason: "oferta",
    },
  },
  judge: {
    status: "ok",
    evaluation: {
      outcome: "violation",
      confidence: 0.95,
      targets: [{ candidateIndex: 0, label: "job_offer", evidence: [] }],
      reason: "oferta",
    },
  },
  primaryGeneration: null,
  judgeGeneration: null,
}));
const adjudicateMock = mock(() => ({
  kind: "review",
  targets: [],
  reason: "insufficient_agreement",
}));
const getModeMock = mock(async () => "shadow");
const listCorrectionContextMock = mock(async () => "");
const createRunMock = mock(async () => ({
  runId: 42,
  targetIdsByCandidate: new Map([[0, 101]]),
}));
const setTargetActionMock = mock(async () => {});
const coordinateDeleteMock = mock(async (_input: unknown, effect: () => Promise<boolean>) => {
  const executed = await effect();
  return { executed: true, status: executed ? "succeeded" : "failed", error: null };
});
mock.module("@/features/ai-moderation", () => ({
  evaluateDual: evaluateDualMock,
  adjudicate: adjudicateMock,
  ModerationConfigService: { getMode: getModeMock },
  ModerationReviewService: { listCorrectionContext: listCorrectionContextMock },
  ModerationRunsService: {
    create: createRunMock,
    setTargetAction: setTargetActionMock,
  },
  ModerationActionCoordinator: { delete: coordinateDeleteMock },
}));

const safeDeleteMock = mock(async (message: { delete: () => Promise<unknown> }) => {
  await message.delete();
  return true;
});
mock.module("@/core/discord/moderation", () => ({ safeDelete: safeDeleteMock }));

import { enforceJobGuard } from "@/features/job-guard/handlers/enforce.handler";

function setVerdict(v: { ok: boolean; verdict?: string; confidence?: number; reason?: string }) {
  classifyMock.mockImplementation(async () => v as { ok: boolean });
}

function setDecision(kind: string, targets: { candidateIndex: number; label: string }[] = []) {
  adjudicateMock.mockImplementation(() => ({
    kind,
    targets,
    reason: kind,
  }) as never);
}

beforeEach(() => {
  classifyMock.mockClear();
  insertCaseMock.mockClear();
  insertCaseMock.mockImplementation(async () => 7);
  getLogChannelMock.mockImplementation(async () => null);
  setVerdict({ ok: false });
  evaluateDualMock.mockClear();
  adjudicateMock.mockClear();
  setDecision("review");
  getModeMock.mockClear();
  getModeMock.mockImplementation(async () => "shadow");
  listCorrectionContextMock.mockClear();
  createRunMock.mockClear();
  createRunMock.mockImplementation(async () => ({
    runId: 42,
    targetIdsByCandidate: new Map([[0, 101]]),
  }));
  setTargetActionMock.mockClear();
  coordinateDeleteMock.mockClear();
  coordinateDeleteMock.mockImplementation(async (_input: unknown, effect: () => Promise<boolean>) => {
    const executed = await effect();
    return { executed: true, status: executed ? "succeeded" : "failed", error: null };
  });
  safeDeleteMock.mockClear();
  safeDeleteMock.mockImplementation(async (message: { delete: () => Promise<unknown> }) => {
    await message.delete();
    return true;
  });
});

describe("enforceJobGuard", () => {
  it("ignores messages in other channels (no AI call)", async () => {
    const msg = createMockMessage({ channelId: "other", content: "se busca dev" });
    await enforceJobGuard(msg);
    expect(classifyMock).not.toHaveBeenCalled();
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("skips authors with ManageMessages (no AI call)", async () => {
    setVerdict({ ok: true, verdict: "block", confidence: 0.95, reason: "aviso" });
    const msg = createMockMessage({
      channelId: "chan-1",
      content: "Por favor, no evitar conversaciones por aquí",
      manageMessages: true,
    });
    await enforceJobGuard(msg);
    expect(classifyMock).not.toHaveBeenCalled();
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("ignores empty messages (no AI call)", async () => {
    const msg = createMockMessage({ channelId: "chan-1", content: "   " });
    await enforceJobGuard(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("deletes on a confident block", async () => {
    setVerdict({ ok: true, verdict: "block", confidence: 0.9, reason: "oferta" });
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev, pago" });
    await enforceJobGuard(msg);
    expect(classifyMock).toHaveBeenCalledTimes(1);
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });

  it("does NOT delete a low-confidence block (alert only)", async () => {
    setVerdict({ ok: true, verdict: "block", confidence: 0.5, reason: "quizá" });
    const msg = createMockMessage({ channelId: "chan-1", content: "algo ambiguo" });
    await enforceJobGuard(msg);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("does nothing on an allow verdict", async () => {
    setVerdict({ ok: true, verdict: "allow", confidence: 0.9, reason: "autopromo" });
    const msg = createMockMessage({ channelId: "chan-1", content: "soy dev, busco trabajo" });
    await enforceJobGuard(msg);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("does NOT delete on an AI error", async () => {
    setVerdict({ ok: false });
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });
    await enforceJobGuard(msg);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("guards against messages with no guild (short-circuits before AI call)", async () => {
    const msg = createMockMessage({
      channelId: "chan-1",
      guildId: null,
      content: "se busca dev",
    });
    setVerdict({ ok: true, verdict: "block", confidence: 0.9 });
    await enforceJobGuard(msg);
    expect(classifyMock).not.toHaveBeenCalled();
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("inserts a case and attaches feedback buttons on block", async () => {
    setVerdict({ ok: true, verdict: "block", confidence: 0.9, reason: "oferta" });
    getLogChannelMock.mockImplementation(async () => "log-1");
    const sendMock = mock(async () => ({}));
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });
    msg.guild!.channels.fetch = mock(async (id: string) => {
      if (id === "log-1") {
        return { type: ChannelType.GuildText, send: sendMock } as never;
      }
      return null;
    });
    await enforceJobGuard(msg);
    expect(insertCaseMock).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalled();
    const payload = JSON.stringify(sendMock.mock.calls[0]?.[0]);
    expect(payload).toContain("jobguard_7_correct");
    expect(payload).toContain("jobguard_7_incorrect");
    expect(payload).toContain("Correcto");
    expect(payload).toContain("Incorrecto");
  });

  it("returns early if feature is disabled (env vars not set)", async () => {
    const originalJOB_CHANNEL_ID = mockEnv.JOB_CHANNEL_ID;
    mockEnv.JOB_CHANNEL_ID = undefined as unknown as string;
    try {
      const msg = createMockMessage({
        channelId: "chan-1",
        content: "se busca dev",
      });
      setVerdict({ ok: true, verdict: "block", confidence: 0.9 });
      await enforceJobGuard(msg);
      expect(classifyMock).not.toHaveBeenCalled();
      expect(msg.delete).not.toHaveBeenCalled();
    } finally {
      mockEnv.JOB_CHANNEL_ID = originalJOB_CHANNEL_ID;
    }
  });

  it("persists and deletes once for an autonomous violation without buttons", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    setDecision("auto_violation", [{ candidateIndex: 0, label: "job_offer" }]);
    getLogChannelMock.mockImplementation(async () => "log-1");
    const sendMock = mock(async () => ({}));
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });
    msg.guild!.channels.fetch = mock(async () => ({
      type: ChannelType.GuildText,
      send: sendMock,
    }) as never);

    await enforceJobGuard(msg);

    expect(evaluateDualMock).toHaveBeenCalledTimes(1);
    expect(createRunMock).toHaveBeenCalledTimes(1);
    expect(coordinateDeleteMock).toHaveBeenCalledTimes(1);
    expect(insertCaseMock).toHaveBeenCalledWith(expect.objectContaining({
      moderationTargetId: 101,
      resolved: true,
      resolvedBy: "system",
      resolvedAction: "auto",
      deleted: true,
    }));
    expect(JSON.stringify(sendMock.mock.calls[0]?.[0])).not.toContain("jobguard_7_");
  });

  it("keeps an autonomous allow action-free unless audit selects it", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    setDecision("auto_allow");
    const random = Math.random;
    Math.random = () => 0.9;
    try {
      const msg = createMockMessage({ channelId: "chan-1", content: "busco trabajo" });
      await enforceJobGuard(msg);
      expect(createRunMock).toHaveBeenCalledTimes(1);
      expect(coordinateDeleteMock).not.toHaveBeenCalled();
      expect(insertCaseMock).not.toHaveBeenCalled();
      expect(msg.delete).not.toHaveBeenCalled();
    } finally {
      Math.random = random;
    }
  });

  it("routes sampled allows to a pending audit case", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    setDecision("auto_allow");
    getLogChannelMock.mockImplementation(async () => "log-1");
    const sendMock = mock(async () => ({}));
    const msg = createMockMessage({ channelId: "chan-1", content: "busco trabajo" });
    msg.guild!.channels.fetch = mock(async () => ({
      type: ChannelType.GuildText,
      send: sendMock,
    }) as never);
    const random = Math.random;
    Math.random = () => 0.01;
    try {
      await enforceJobGuard(msg);
    } finally {
      Math.random = random;
    }

    expect(coordinateDeleteMock).not.toHaveBeenCalled();
    expect(insertCaseMock).toHaveBeenCalledWith(expect.objectContaining({
      moderationTargetId: 101,
      resolved: false,
    }));
    expect(JSON.stringify(sendMock.mock.calls[0]?.[0])).toContain("modreview_101_confirm");
    expect(JSON.stringify(sendMock.mock.calls[0]?.[0])).toContain("modreview_101_correct");
  });

  it("creates a pending review with original content and buttons", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    setDecision("review");
    getLogChannelMock.mockImplementation(async () => "log-1");
    const sendMock = mock(async () => ({}));
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });
    msg.guild!.channels.fetch = mock(async () => ({
      type: ChannelType.GuildText,
      send: sendMock,
    }) as never);

    await enforceJobGuard(msg);

    expect(msg.delete).not.toHaveBeenCalled();
    expect(insertCaseMock).toHaveBeenCalledWith(expect.objectContaining({
      moderationTargetId: 101,
      resolved: false,
    }));
    const payload = JSON.stringify(sendMock.mock.calls[0]?.[0]);
    expect(payload).toContain("se busca dev");
    expect(payload).toContain("modreview_101_confirm");
    expect(payload).not.toContain("jobguard_7_");
  });

  it("persists technical errors without deleting", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    setDecision("technical_error");
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });

    await enforceJobGuard(msg);

    expect(createRunMock).toHaveBeenCalledTimes(1);
    expect(coordinateDeleteMock).not.toHaveBeenCalled();
    expect(insertCaseMock).not.toHaveBeenCalled();
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("does not delete when run persistence fails", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    createRunMock.mockRejectedValueOnce(new Error("database unavailable"));
    getLogChannelMock.mockImplementation(async () => "log-1");
    const sendMock = mock(async () => ({}));
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });
    msg.guild!.channels.fetch = mock(async () => ({
      type: ChannelType.GuildText,
      send: sendMock,
    }) as never);

    await enforceJobGuard(msg);

    expect(coordinateDeleteMock).not.toHaveBeenCalled();
    expect(msg.delete).not.toHaveBeenCalled();
    expect(JSON.stringify(sendMock.mock.calls[0]?.[0])).toContain("Persistencia falló");
    expect(JSON.stringify(sendMock.mock.calls[0]?.[0])).not.toContain("jobguard_");
  });

  it("runs dual evaluation before retaining legacy shadow enforcement", async () => {
    setVerdict({ ok: true, verdict: "block", confidence: 0.9, reason: "oferta" });
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });

    await enforceJobGuard(msg);

    expect(evaluateDualMock).toHaveBeenCalledTimes(1);
    expect(createRunMock).toHaveBeenCalledTimes(1);
    expect(classifyMock).toHaveBeenCalledTimes(1);
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });
});
