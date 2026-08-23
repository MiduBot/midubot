import type { Message } from "discord.js";
import { describe, it, expect, beforeEach, mock } from "bun:test";

// --- ALL mock.module calls MUST come before any import that uses the mocked module ---

const envMock = {
  AI_API_URL: "https://ai.test/v1/chat/completions",
  AI_API_KEY: "k",
  AI_MODEL: "m",
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
mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: mock(async () => false),
}));

const configMock = { isEnabled: mock(async () => true) };
const modRoleMock = { hasRole: mock(async () => true) };
const bypassMock = { isBypass: mock(async () => false) };
const notifyMock = { list: mock(async () => []) };
const contextMock = { buildContext: mock(async () => ({ examples: "", prompts: "" })) };
const casesMock = { insert: mock(async () => 99) };
const logChannelMock = { getLogChannel: mock(async () => "log-1") };
const imagesMock = {
  ImageService: { addImage: mock(async () => {}) },
  ImageHashService: { downloadFingerprint: mock(async () => null) },
};

const classifyMock = mock(async () => ({
  ok: true,
  entries: [{ index: 0, v: 1, c: 0.95, r: "spam", p: 0 }],
}));

const imageDupMock = mock(async () => ({
  flagged: true,
  reason: "imagen spam cross-channel",
  matchedMessages: [] as Message[],
}));

mock.module("@/features/ai-mod/services/ai-mod-config.service", () => ({ AiModConfigService: configMock }));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({ ModRoleService: modRoleMock }));
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({ SelfpromoBypassService: bypassMock }));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({ NotifyTargetsService: notifyMock }));
mock.module("@/features/ai-mod/services/context-builder.service", () => ({ ContextBuilderService: contextMock }));
mock.module("@/features/ai-mod/services/cases.service", () => ({ CasesService: casesMock }));
mock.module("@/features/log-channel", () => ({ LogChannelService: logChannelMock }));
mock.module("@/features/images", () => imagesMock);
mock.module("@/features/ai-mod/services/classifier.service", () => ({ classifyBatch: classifyMock }));
mock.module("@/features/ai-mod/services/image-duplicate.service", () => ({
  ImageDuplicateService: { checkImage: imageDupMock },
}));

// Runtime-switchable puff content kind so the same mock setup can drive
// image-route and text-route tests.
let puffKind: "image" | "text" = "image";
mock.module("@/features/puff", () => ({
  extractPuffContent: () =>
    puffKind === "image"
      ? { kind: "image", imageUrls: ["https://x/imgA.png"] }
      : { kind: "text", text: "spam" },
}));

// --- All imports must come after all mock.module calls ---

import { handleModMention } from "@/features/ai-mod/handlers/mod-mention.handler";
import { SanctionCache } from "@/features/ai-mod/services/sanction-cache.service";
import { createMockMessage, createMockMember, createMockTextChannel } from "../../../mocks/discord";

function makeFetchableMember(id: string) {
  const m = createMockMember({ id, moderatable: true });
  (m as unknown as { isCommunicationDisabled: () => boolean }).isCommunicationDisabled = () => false;
  return m;
}

beforeEach(() => {
  SanctionCache._resetForTests();
  puffKind = "image";
  casesMock.insert.mockClear();
  casesMock.insert.mockImplementation(async () => 99);
  classifyMock.mockClear();
  classifyMock.mockImplementation(async () => ({
    ok: true,
    entries: [{ index: 0, v: 1, c: 0.95, r: "spam", p: 0 }],
  }));
  imageDupMock.mockReset();
  imageDupMock.mockResolvedValue({
    flagged: true,
    reason: "imagen spam cross-channel",
    channelCount: 3,
    matchedMessages: [],
  });
  imagesMock.ImageService.addImage.mockClear();
  imagesMock.ImageService.addImage.mockImplementation(async () => {});
  imagesMock.ImageHashService.downloadFingerprint.mockClear();
  imagesMock.ImageHashService.downloadFingerprint.mockImplementation(async () => null);
  logChannelMock.getLogChannel.mockImplementation(async () => "log-1");
});

function setupReport() {
  // Image candidate so the image-route runs (handler calls
  // ImageDuplicateService.checkImage and the crossChannelMessages from the
  // mock flow into the sweep).
  const offender = createMockMessage({
    id: "offender-msg",
    author: { id: "spammer-1" },
    content: "",
    attachments: [{ url: "https://x/imgA.png", contentType: "image/png" }],
  });
  offender.member = makeFetchableMember("spammer-1");
  offender.isCommunicationDisabled = mock(() => false) as never;

  const report = createMockMessage({
    id: "report-1",
    content: "<@&mod>",
    attachments: [],
  });
  (report as unknown as { mentions: { roles: Map<string, unknown> } }).mentions = {
    roles: new Map([["mod", { id: "mod" }]]),
  };
  const ch = createMockTextChannel({
    id: "ch-1",
    messagesFetchResult: new Map([[offender.id, offender]]),
  });

  // Cross-channel target channel: the sweep helper calls
  // guild.channels.fetch(matchedMsg.channelId) and then bulkDelete on the
  // returned channel. We expose the bulkDelete mock so test 1 can assert it.
  const crossChannelId = "222222222222222222";
  const crossChannelBulkDelete = mock(async (ids: string[]) => ids);
  const crossChannelChannel = {
    id: crossChannelId,
    bulkDelete: crossChannelBulkDelete,
  };

  report.guild = {
    id: "g1",
    channels: {
      fetch: mock(async (id?: string) => {
        if (id === crossChannelId) return crossChannelChannel;
        // log-1 and any other id: return a Map (handler's type check fails,
        // so no alert is sent — preserves prior behavior).
        return new Map([
          ["log-1", { ...createMockTextChannel({ id: "log-1" }), send: mock(async () => ({})) }],
        ]);
      }),
    },
    members: {
      fetch: mock(async (id: string) => makeFetchableMember(id)),
    },
  } as never;
  report.channel = ch as never;
  report.reference = null;
  return { report, offender, crossChannelId, crossChannelBulkDelete };
}

describe("handleModMention — cross-channel + dedup", () => {
  it("calls CasesService.insert once and bulk-deletes cross-channel matches via the sweep helper", async () => {
    const { report, crossChannelId, crossChannelBulkDelete } = setupReport();
    const matchedMsg = createMockMessage({
      id: "cross-1",
      author: { id: "spammer-1" },
      content: "dup",
      channelId: crossChannelId,
    });
    matchedMsg.delete = mock(() => Promise.resolve()) as never;
    matchedMsg.createdTimestamp = Date.now() - 1000;
    imageDupMock.mockResolvedValueOnce({
      flagged: true,
      reason: "imagen spam cross-channel",
      channelCount: 3,
      matchedMessages: [matchedMsg],
    });
    imagesMock.ImageHashService.downloadFingerprint.mockResolvedValueOnce({
      dhash: "abc",
      phash: "xyz",
    } as never);
    await handleModMention(report);
    expect(casesMock.insert).toHaveBeenCalledTimes(1);
    expect(crossChannelBulkDelete).toHaveBeenCalledWith(["cross-1"]);
    expect(imagesMock.ImageService.addImage).toHaveBeenCalled();
  });

  it("does NOT call CasesService.insert on the second call within TTL (cache hit)", async () => {
    const { report, crossChannelId, crossChannelBulkDelete } = setupReport();
    const matchedCache = createMockMessage({
      id: "cross-cache-1",
      author: { id: "spammer-1" },
      content: "dup",
      channelId: crossChannelId,
    });
    matchedCache.delete = mock(() => Promise.resolve()) as never;
    matchedCache.createdTimestamp = Date.now() - 1000;
    imageDupMock.mockResolvedValue({
      flagged: true,
      reason: "imagen spam cross-channel",
      channelCount: 3,
      matchedMessages: [matchedCache],
    });
    await handleModMention(report);
    expect(casesMock.insert).toHaveBeenCalledTimes(1);

    casesMock.insert.mockClear();
    await handleModMention(report);
    expect(casesMock.insert).not.toHaveBeenCalled();
    expect(crossChannelBulkDelete).toHaveBeenCalledTimes(2);
  });

  it("groups text + image for the same author into one case row", async () => {
    puffKind = "text";
    classifyMock.mockResolvedValueOnce({
      ok: true,
      entries: [
        { index: 0, v: 1, c: 0.9, r: "spam", p: 0 },
        { index: 1, v: 1, c: 0.9, r: "spam2", p: 0 },
      ],
    });
    const m1 = createMockMessage({ id: "a1", author: { id: "spammer-2" }, content: "x" });
    const m2 = createMockMessage({ id: "a2", author: { id: "spammer-2" }, content: "y" });
    m1.member = makeFetchableMember("spammer-2");
    m2.member = makeFetchableMember("spammer-2");
    m1.isCommunicationDisabled = mock(() => false) as never;
    m2.isCommunicationDisabled = mock(() => false) as never;
    const ch = createMockTextChannel({
      id: "ch-2",
      messagesFetchResult: new Map([[m1.id, m1], [m2.id, m2]]),
    });
    const report = createMockMessage({ id: "rep2", content: "<@&mod>" });
    (report as unknown as { mentions: { roles: Map<string, unknown> } }).mentions = {
      roles: new Map([["mod", { id: "mod" }]]),
    };
    report.guild = {
      id: "g1",
      channels: {
        fetch: mock(async () => new Map([
          ["log-1", { ...createMockTextChannel({ id: "log-1" }), send: mock(async () => ({})) }],
        ])),
      },
      members: {
        fetch: mock(async (id: string) => makeFetchableMember(id)),
      },
    } as never;
    report.channel = ch as never;
    report.reference = null;

    await handleModMention(report);
    expect(casesMock.insert).toHaveBeenCalledTimes(1);
    expect(m1.delete).toHaveBeenCalled();
    expect(m2.delete).toHaveBeenCalled();
  });
});
