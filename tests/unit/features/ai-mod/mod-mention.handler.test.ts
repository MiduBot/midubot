import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage, createMockGuild, createMockTextChannel } from "../../../mocks/discord";

const envMock = {
  AI_API_URL: "https://ai.test/v1/chat/completions",
  AI_API_KEY: "test-key",
  AI_MODEL: "deepseek-v4-flash",
  JOB_CHANNEL_ID: "",
  DISCORD_PREFIX: "m!",
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "c",
  TURSO_CONNECTION_URL: "file::memory:",
  TURSO_AUTH_TOKEN: "t",
  NODE_ENV: "test",
  LOG_LEVEL: "error",
};
mock.module("@/config/env", () => ({ env: envMock }));

const configMock = { isEnabled: mock(async () => true) };
const modRoleMock = { hasRole: mock(async () => true) };
const bypassMock = { isBypass: mock(async () => false) };
const notifyMock = { list: mock(async () => []) };
const contextMock = { buildContext: mock(async () => ({ examples: "", prompts: "" })) };
const classifyMock = mock(async () => ({ ok: false, entries: [] }) as never);
const imageDupMock = {
  checkImage: mock(async () => ({
    flagged: false,
    reason: "",
    channelCount: 1,
    matchedMessages: [],
  })),
};
const casesMock = { insert: mock(async () => 1) };
const logChannelMock = { getLogChannel: mock(async () => null) };
const languageMock = { getLanguage: mock(async () => "es" as const) };
const downloadFingerprintMock = mock(async () => ({ hash: "fingerprint" }));
const addImageMock = mock(async () => undefined);
const isIgnoredMock = mock(async () => false);

const getModeMock = mock(async () => "shadow");
const listCorrectionContextMock = mock(async () => "");
const evaluateDualMock = mock(async () => ({
  primary: {
    status: "ok",
    evaluation: {
      outcome: "violation",
      confidence: 0.95,
      targets: [{ candidateIndex: 0, label: "malicious", evidence: [] }],
      reason: "estafa",
    },
  },
  judge: {
    status: "ok",
    evaluation: {
      outcome: "violation",
      confidence: 0.95,
      targets: [{ candidateIndex: 0, label: "malicious", evidence: [] }],
      reason: "estafa",
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
const createRunMock = mock(async (input: { candidates: { index: number }[] }) => ({
  runId: 42,
  targetIdsByCandidate: new Map(input.candidates.map((candidate) => [candidate.index, candidate.index + 100])),
}));
const setTargetActionMock = mock(async () => {});
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

mock.module("@/core/discord/ignored-channels", () => ({ isIgnored: isIgnoredMock }));
mock.module("@/features/ai-mod/services/ai-mod-config.service", () => ({ AiModConfigService: configMock }));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({ ModRoleService: modRoleMock }));
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({ SelfpromoBypassService: bypassMock }));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({ NotifyTargetsService: notifyMock }));
mock.module("@/features/ai-mod/services/context-builder.service", () => ({ ContextBuilderService: contextMock }));
mock.module("@/features/ai-mod/services/classifier.service", () => ({ classifyBatch: classifyMock }));
mock.module("@/features/ai-mod/services/image-duplicate.service", () => ({ ImageDuplicateService: imageDupMock }));
mock.module("@/features/ai-mod/services/cases.service", () => ({ CasesService: casesMock }));
mock.module("@/features/log-channel", () => ({ LogChannelService: logChannelMock }));
mock.module("@/features/language", () => ({ LanguageService: languageMock }));
mock.module("@/features/images", () => ({
  ImageHashService: { downloadFingerprint: downloadFingerprintMock },
  ImageService: { addImage: addImageMock },
}));
mock.module("@/features/puff", () => ({
  extractPuffContent: (m: { content: string; attachments: { size: number } }) =>
    m.attachments.size > 0 ? { kind: "image", imageUrls: ["x"] } : m.content ? { kind: "text", text: m.content } : null,
}));
mock.module("@/features/ai-moderation", () => ({
  ModerationConfigService: { getMode: getModeMock },
  ModerationReviewService: { listCorrectionContext: listCorrectionContextMock },
  ModerationRunsService: {
    create: createRunMock,
    setTargetAction: setTargetActionMock,
  },
  ModerationActionCoordinator: {
    delete: coordinateDeleteMock,
    timeout: coordinateTimeoutMock,
  },
  evaluateDual: evaluateDualMock,
  adjudicate: adjudicateMock,
}));

import { handleModMention } from "@/features/ai-mod/handlers/mod-mention.handler";

beforeEach(() => {
  isIgnoredMock.mockClear();
  isIgnoredMock.mockImplementation(async () => false);
  configMock.isEnabled.mockImplementation(async () => true);
  modRoleMock.hasRole.mockImplementation(async () => true);
  classifyMock.mockImplementation(async () => ({ ok: false, entries: [] }) as never);
  classifyMock.mockClear();
  casesMock.insert.mockClear();
  casesMock.insert.mockImplementation(async () => 1);
  imageDupMock.checkImage.mockClear();
  imageDupMock.checkImage.mockImplementation(async () => ({
    flagged: false,
    reason: "",
    channelCount: 1,
    matchedMessages: [],
  }));
  languageMock.getLanguage.mockClear();
  languageMock.getLanguage.mockImplementation(async () => "es" as const);
  downloadFingerprintMock.mockClear();
  downloadFingerprintMock.mockImplementation(async () => ({ hash: "fingerprint" }));
  addImageMock.mockClear();
  addImageMock.mockImplementation(async () => undefined);
  getModeMock.mockClear();
  getModeMock.mockImplementation(async () => "shadow");
  listCorrectionContextMock.mockClear();
  evaluateDualMock.mockClear();
  adjudicateMock.mockClear();
  adjudicateMock.mockImplementation(() => ({
    kind: "review",
    targets: [],
    reason: "insufficient_agreement",
  }));
  createRunMock.mockClear();
  createRunMock.mockImplementation(async (input: { candidates: { index: number }[] }) => ({
    runId: 42,
    targetIdsByCandidate: new Map(input.candidates.map((candidate) => [candidate.index, candidate.index + 100])),
  }));
  setTargetActionMock.mockClear();
  coordinateDeleteMock.mockClear();
  coordinateTimeoutMock.mockClear();
});

describe("handleModMention", () => {
  it("returns early when the feature is disabled", async () => {
    configMock.isEnabled.mockImplementation(async () => false);
    const msg = makeReportMessage("r1");
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("returns early when no mod role is mentioned", async () => {
    modRoleMock.hasRole.mockImplementation(async () => false);
    const msg = makeReportMessage("r1");
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("returns early when the author is a bot", async () => {
    const msg = makeReportMessage("r1", { authorBot: true });
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("returns early when the reporter has ManageMessages", async () => {
    const msg = makeReportMessage("r1");
    (msg.member as unknown as { permissions: { has: (p: unknown) => boolean } }).permissions = {
      has: () => true,
    };
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("skips last-10 candidates whose author has ManageMessages", async () => {
    const candidate = createMockMessage({
      id: "cand1",
      content: "staff post",
      channelId: "c1",
      guildId: "g1",
      manageMessages: true,
    });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
    expect(candidate.delete).not.toHaveBeenCalled();
  });

  it("skips reply target when author has ManageMessages", async () => {
    const candidate = createMockMessage({
      id: "ref1",
      content: "staff reply",
      channelId: "c1",
      guildId: "g1",
      manageMessages: true,
    });
    const channel = createMockTextChannel({
      id: "c1",
      guildId: "g1",
      messagesFetchResult: async (arg: unknown) => {
        if (arg === "ref1") return candidate;
        return new Map([[candidate.id, candidate]]);
      },
    });
    const guild = createMockGuild({ id: "g1", channels: new Map([["c1", channel]]) });
    const msg = makeReportMessage("r1");
    (msg as unknown as { guild: unknown }).guild = guild;
    (msg as unknown as { channel: unknown }).channel = channel;
    (msg as unknown as { reference: { messageId: string } }).reference = { messageId: "ref1" };
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
    expect(candidate.delete).not.toHaveBeenCalled();
  });

  it("classifies a clean/inconclusive batch without throwing (no log channel)", async () => {
    classifyMock.mockImplementation(async () => ({ ok: true, entries: [] }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "hola", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(classifyMock).toHaveBeenCalledTimes(1);
  });

  it("does not delete, timeout, or insert a case when AI fails", async () => {
    classifyMock.mockImplementation(async () => ({ ok: false, entries: [] }) as never);
    const candidate = createMockMessage({
      id: "cand1",
      content: "hola",
      channelId: "c1",
      guildId: "g1",
    });
    const report = makeReportMessage("r1", { channelMessages: [candidate] });

    await handleModMention(report);

    expect(candidate.delete).not.toHaveBeenCalled();
    expect(casesMock.insert).not.toHaveBeenCalled();
  });

  it("returns before classification for an ignored channel", async () => {
    isIgnoredMock.mockImplementation(async () => true);
    const candidate = createMockMessage({
      id: "cand1",
      content: "hola",
      channelId: "c1",
      guildId: "g1",
    });
    const report = makeReportMessage("r1", { channelMessages: [candidate] });

    await handleModMention(report);

    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("on a high-confidence malicious verdict, deletes the flagged message", async () => {
    classifyMock.mockImplementation(async () => ({
      ok: true,
      entries: [{ index: 0, v: 1, c: 0.95, r: "estafa", p: 0 }],
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "send me a DM", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(candidate.delete).toHaveBeenCalled();
  });

  it("on mid-confidence flag (0.5–0.8), still deletes (no alert-only band)", async () => {
    classifyMock.mockImplementation(async () => ({
      ok: true,
      entries: [{ index: 0, v: 1, c: 0.6, r: "posible estafa", p: 0 }],
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "maybe scam", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(candidate.delete).toHaveBeenCalled();
  });

  it("on unflagged image (no ≥3-channel spread), still deletes the candidate", async () => {
    imageDupMock.checkImage.mockImplementation(async () => ({
      flagged: false,
      reason: "",
      channelCount: 1,
      matchedMessages: [],
    }));
    const candidate = createMockMessage({
      id: "cand1",
      content: "",
      channelId: "c1",
      guildId: "g1",
      attachments: [{ url: "https://x/img.png", contentType: "image/png" }],
    });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(imageDupMock.checkImage).toHaveBeenCalled();
    expect(downloadFingerprintMock).toHaveBeenCalledWith("https://x/img.png");
    expect(addImageMock).toHaveBeenCalledWith("g1", "aimod-cand1-0", "https://x/img.png");
    expect(candidate.delete).toHaveBeenCalled();
  });

  it("bypasses a v=2 p∈{1,2,3} selfpromo in a bypass channel (no delete)", async () => {
    bypassMock.isBypass.mockImplementation(async () => true);
    classifyMock.mockImplementation(async () => ({
      ok: true,
      entries: [{ index: 0, v: 2, c: 0.9, r: "yt selfpromo", p: 1 }],
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "watch my yt", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(candidate.delete).not.toHaveBeenCalled();
  });

  it("does not re-timeout an already-disabled author", async () => {
    classifyMock.mockImplementation(async () => ({
      ok: true,
      entries: [{ index: 0, v: 1, c: 0.95, r: "estafa", p: 0 }],
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "scam", channelId: "c1", guildId: "g1" });
    (candidate.member as unknown as { isCommunicationDisabled: () => boolean }).isCommunicationDisabled = () => true;
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect((candidate.member as unknown as { timeout: (d: number | null, r?: string) => Promise<unknown> }).timeout).not.toHaveBeenCalled();
  });

  it("uses persisted dual adjudication for autonomous mode", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    adjudicateMock.mockImplementation(() => ({
      kind: "auto_violation",
      targets: [{ candidateIndex: 0, label: "malicious" }],
      reason: "agreement_violation",
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "send me a DM", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });

    await handleModMention(msg);

    expect(classifyMock).not.toHaveBeenCalled();
    expect(evaluateDualMock).toHaveBeenCalledTimes(1);
    expect(createRunMock).toHaveBeenCalledTimes(1);
    expect(candidate.delete).toHaveBeenCalledTimes(1);
    expect(casesMock.insert).toHaveBeenCalledWith(expect.objectContaining({ moderationTargetId: 100 }));
  });

  it("does not act when moderation run persistence fails", async () => {
    getModeMock.mockImplementation(async () => "autonomous");
    createRunMock.mockRejectedValueOnce(new Error("database unavailable"));
    const candidate = createMockMessage({ id: "cand1", content: "send me a DM", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    logChannelMock.getLogChannel.mockImplementation(async () => "log-1");
    const logChannel = createMockTextChannel({ id: "log-1", guildId: "g1" });
    msg.guild!.channels.fetch = mock(async () => logChannel) as never;

    await handleModMention(msg);

    expect(candidate.delete).not.toHaveBeenCalled();
    expect((candidate.member as unknown as { timeout: ReturnType<typeof mock> }).timeout).not.toHaveBeenCalled();
    const payload = JSON.stringify((logChannel.send as ReturnType<typeof mock>).mock.calls[0]?.[0]);
    expect(payload).toContain("send me a DM");
    expect(payload).not.toContain("customId");
  });
});

function makeReportMessage(
  mentionedRoleId: string,
  opts: { authorBot?: boolean; channelMessages?: ReturnType<typeof createMockMessage>[] } = {},
): ReturnType<typeof createMockMessage> {
  const channel = createMockTextChannel({
    id: "c1",
    guildId: "g1",
    messagesFetchResult: new Map(
      (opts.channelMessages ?? []).map((m) => [m.id, m]),
    ),
  });
  const guild = createMockGuild({ id: "g1", channels: new Map([["c1", channel]]) });
  const msg = createMockMessage({
    id: "report1",
    content: `<@&${mentionedRoleId}>`,
    guildId: "g1",
    channelId: "c1",
    author: { id: "reporter", bot: opts.authorBot ?? false },
  });
  (msg as unknown as { guild: unknown }).guild = guild;
  (msg as unknown as { channel: unknown }).channel = channel;
  (msg as unknown as { mentions: { roles: Map<string, unknown> } }).mentions = {
    roles: new Map([[mentionedRoleId, { id: mentionedRoleId }]]),
  };
  (msg as unknown as { reference: null }).reference = null;
  return msg;
}
