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

mock.module("@/features/ai-mod/services/ai-mod-config.service", () => ({ AiModConfigService: configMock }));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({ ModRoleService: modRoleMock }));
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({ SelfpromoBypassService: bypassMock }));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({ NotifyTargetsService: notifyMock }));
mock.module("@/features/ai-mod/services/context-builder.service", () => ({ ContextBuilderService: contextMock }));
mock.module("@/features/ai-mod/services/classifier.service", () => ({ classifyBatch: classifyMock }));
mock.module("@/features/ai-mod/services/image-duplicate.service", () => ({ ImageDuplicateService: imageDupMock }));
mock.module("@/features/ai-mod/services/cases.service", () => ({ CasesService: casesMock }));
mock.module("@/features/log-channel", () => ({ LogChannelService: logChannelMock }));
mock.module("@/features/puff", () => ({
  extractPuffContent: (m: { content: string; attachments: { size: number } }) =>
    m.attachments.size > 0 ? { kind: "image", imageUrls: ["x"] } : m.content ? { kind: "text", text: m.content } : null,
}));

import { handleModMention } from "@/features/ai-mod/handlers/mod-mention.handler";

beforeEach(() => {
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

  it("classifies a clean/inconclusive batch without throwing (no log channel)", async () => {
    classifyMock.mockImplementation(async () => ({ ok: true, entries: [] }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "hola", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(classifyMock).toHaveBeenCalledTimes(1);
  });

  it("on AI failure, still deletes text candidates (fallback action)", async () => {
    classifyMock.mockImplementation(async () => ({ ok: false, entries: [] }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "hola", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(candidate.delete).toHaveBeenCalled();
    expect(casesMock.insert).toHaveBeenCalledTimes(1);
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
