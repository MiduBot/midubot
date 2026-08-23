import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createMockMessage, createMockMember } from "../../../mocks/discord";

const safeDeleteMock = mock(async (message: { delete: () => Promise<unknown> }) => {
  await message.delete();
  return true;
});
const safeTimeoutMock = mock(async (member: { timeout: (duration: number, reason?: string) => Promise<unknown> }, duration: number) => {
  await member.timeout(duration);
  return true;
});
mock.module("@/core/discord/moderation", () => ({
  safeDelete: safeDeleteMock,
  safeTimeout: safeTimeoutMock,
}));

const bypassMock = mock(async () => false);
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({
  SelfpromoBypassService: { isBypass: bypassMock },
}));

const insertCaseMock = mock(async () => 1);
mock.module("@/features/ai-mod/services/cases.service", () => ({
  CasesService: { insert: insertCaseMock },
}));

const prepareEvidenceFilesMock = mock(async () => []);
mock.module("@/features/ai-moderation/services/evidence-files.service", () => ({
  prepareEvidenceFiles: prepareEvidenceFilesMock,
}));

const logSendMock = mock(async () => ({}));
mock.module("@/features/log-channel", () => ({
  LogChannelService: { getLogChannel: mock(async () => "log-1") },
}));
mock.module("@/features/language", () => ({
  LanguageService: { getLanguage: mock(async () => "es") },
}));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({
  NotifyTargetsService: { list: mock(async () => []) },
}));

const coordinateDeleteMock = mock(async (_input: unknown, effect: () => Promise<boolean>) => ({
  executed: true,
  status: (await effect()) ? "succeeded" : "failed",
  error: null,
}));
const coordinateTimeoutMock = mock(async (_input: unknown, effect: () => Promise<boolean>) => ({
  executed: true,
  status: (await effect()) ? "succeeded" : "failed",
  error: null,
}));
mock.module("@/features/ai-moderation", () => ({
  ModerationActionCoordinator: {
    delete: coordinateDeleteMock,
    timeout: coordinateTimeoutMock,
  },
  ModerationRunsService: {
    setTargetAction: mock(async () => {}),
  },
}));

import { enforceAiModDecision } from "@/features/ai-mod/services/moderation-enforcement.service";

const evaluations = {
  primary: {
    status: "ok" as const,
    evaluation: {
      outcome: "violation" as const,
      confidence: 0.95,
      targets: [],
      reason: "spam",
    },
  },
  judge: {
    status: "ok" as const,
    evaluation: {
      outcome: "violation" as const,
      confidence: 0.95,
      targets: [],
      reason: "spam",
    },
  },
  primaryGeneration: null,
  judgeGeneration: null,
};

function setup() {
  const member = createMockMember({ id: "author-1", moderatable: true });
  (member as unknown as { isCommunicationDisabled: () => boolean }).isCommunicationDisabled = () => false;
  const report = createMockMessage({ guildId: "g1" });
  report.guild!.members.fetch = mock(async () => member);
  report.guild!.channels.fetch = mock(async () => ({
    type: 0,
    send: logSendMock,
  }) as never);
  const target1 = createMockMessage({ id: "target-1", author: { id: "author-1" }, content: "spam one" });
  const target2 = createMockMessage({ id: "target-2", author: { id: "author-1" }, content: "spam two" });
  const messagesByIndex = new Map([[0, target1], [1, target2]]);
  return { report, target1, target2, messagesByIndex };
}

beforeEach(() => {
  safeDeleteMock.mockClear();
  safeTimeoutMock.mockClear();
  bypassMock.mockClear();
  bypassMock.mockImplementation(async () => false);
  insertCaseMock.mockClear();
  insertCaseMock.mockImplementation(async () => 1);
  prepareEvidenceFilesMock.mockClear();
  logSendMock.mockClear();
  coordinateDeleteMock.mockClear();
  coordinateDeleteMock.mockImplementation(async (_input: unknown, effect: () => Promise<boolean>) => ({
    executed: true,
    status: (await effect()) ? "succeeded" : "failed",
    error: null,
  }));
  coordinateTimeoutMock.mockClear();
  coordinateTimeoutMock.mockImplementation(async (_input: unknown, effect: () => Promise<boolean>) => ({
    executed: true,
    status: (await effect()) ? "succeeded" : "failed",
    error: null,
  }));
});

describe("enforceAiModDecision", () => {
  it("deletes each target and times out each author once", async () => {
    const { report, target1, target2, messagesByIndex } = setup();

    await enforceAiModDecision({
      report,
      runId: 11,
      targetIdsByCandidate: new Map([[0, 101], [1, 102]]),
      messagesByIndex,
      adjudication: {
        kind: "auto_violation",
        targets: [
          { candidateIndex: 0, label: "malicious" },
          { candidateIndex: 1, label: "malicious" },
        ],
        reason: "agreement_violation",
      },
      evaluations,
    });

    expect(coordinateDeleteMock).toHaveBeenCalledTimes(2);
    expect(coordinateTimeoutMock).toHaveBeenCalledTimes(1);
    expect(target1.delete).toHaveBeenCalledTimes(1);
    expect(target2.delete).toHaveBeenCalledTimes(1);
    expect(insertCaseMock).toHaveBeenCalledTimes(2);
  });

  it("uses one-hour timeout for temporary actions", async () => {
    const { report, target1, messagesByIndex } = setup();

    await enforceAiModDecision({
      report,
      runId: 11,
      targetIdsByCandidate: new Map([[0, 101]]),
      messagesByIndex: new Map([[0, target1]]),
      adjudication: {
        kind: "temporary_action",
        targets: [{ candidateIndex: 0, label: "malicious" }],
        reason: "single_strong_signal",
      },
      evaluations,
    });

    expect(coordinateTimeoutMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      durationMs: 60 * 60 * 1000,
    }));
    expect(prepareEvidenceFilesMock).toHaveBeenCalled();
    expect(logSendMock).toHaveBeenCalled();
    expect(JSON.stringify(logSendMock.mock.calls[0]?.[0])).toContain("modreview_101_confirm");
  });

  it("does not act on review decisions", async () => {
    const { report, target1, messagesByIndex } = setup();

    await enforceAiModDecision({
      report,
      runId: 11,
      targetIdsByCandidate: new Map([[0, 101]]),
      messagesByIndex,
      adjudication: { kind: "review", targets: [], reason: "target_conflict" },
      evaluations,
    });

    expect(coordinateDeleteMock).not.toHaveBeenCalled();
    expect(coordinateTimeoutMock).not.toHaveBeenCalled();
    expect(target1.delete).not.toHaveBeenCalled();
  });

  it("bypasses eligible self-promo without deleting or timing out", async () => {
    bypassMock.mockImplementation(async () => true);
    const { report, target1, messagesByIndex } = setup();
    target1.content = "mira mi canal https://youtube.com/watch?v=1";

    await enforceAiModDecision({
      report,
      runId: 11,
      targetIdsByCandidate: new Map([[0, 101]]),
      messagesByIndex,
      adjudication: {
        kind: "auto_violation",
        targets: [{ candidateIndex: 0, label: "selfpromo" }],
        reason: "agreement_violation",
      },
      evaluations,
    });

    expect(bypassMock).toHaveBeenCalledWith("g1", target1.channelId);
    expect(coordinateDeleteMock).not.toHaveBeenCalled();
    expect(coordinateTimeoutMock).not.toHaveBeenCalled();
    expect(insertCaseMock).toHaveBeenCalledWith(expect.objectContaining({ actionTaken: "bypass" }));
  });
});
