import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage } from "../../../mocks/discord";

// Env: feature enabled, target channel = "chan-1".
// Store as mutable object so we can override per-test for feature-disabled case.
const mockEnv = {
  AI_API_URL: "https://ai.test/v1/chat/completions",
  AI_API_KEY: "test-key",
  AI_MODEL: "deepseek-v4-flash",
  JOB_CHANNEL_ID: "chan-1",
};

mock.module("@/config/env", () => ({
  env: mockEnv,
}));

// Controllable classifier.
const classifyMock = mock(async () => ({ ok: false }) as { ok: boolean });
mock.module("@/features/job-guard/services/classifier.service", () => ({
  classify: classifyMock,
}));

// No log channel configured -> notifyMods takes the logger-only branch (no send).
mock.module("@/features/log-channel", () => ({
  LogChannelService: { getLogChannel: async () => null },
}));

import { enforceJobGuard } from "@/features/job-guard/handlers/enforce.handler";

function setVerdict(v: { ok: boolean; verdict?: string; confidence?: number; reason?: string }) {
  classifyMock.mockImplementation(async () => v as { ok: boolean });
}

beforeEach(() => {
  classifyMock.mockClear();
  setVerdict({ ok: false });
});

describe("enforceJobGuard", () => {
  it("ignores messages in other channels (no AI call)", async () => {
    const msg = createMockMessage({ channelId: "other", content: "se busca dev" });
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
});
