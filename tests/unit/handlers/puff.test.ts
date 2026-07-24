import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { GuildMember, Message } from "discord.js";

const mockImageService = {
  addImage: mock(async (_g: string, _n: string, _u: string) => undefined),
  removeImage: mock(async (_g: string, _n: string) => undefined),
  removeImageByHash: mock(async (_g: string, _h: string) => undefined),
  listImages: mock(async (_g: string) => []),
  findSimilarImagesByFingerprint: mock(async (_g: string, _f: unknown) => []),
  findSimilarImages: mock(async (_g: string, _h: string) => []),
  migrateImageFingerprints: mock(async (_g: string) => ({
    total: 0,
    alreadyMigrated: 0,
    migrated: 0,
    failed: 0,
    failures: [],
  })),
};

const mockHash = {
  downloadFingerprint: mock(async (_u: string) => ({
    dhash: "h",
    phash: "p",
    ahash: "a",
    colorSig: "ff00aa",
    width: 100,
    height: 100,
  })),
  downloadAndHash: mock(async (_u: string) => "h"),
};

const mockFingerprintCache = {
  getOrComputeFingerprint: mock(async (_u: string, compute: () => Promise<{ dhash: string } | null>) => {
    return compute();
  }),
  getCachedFingerprint: mock((_u: string) => undefined),
  setCachedFingerprint: mock((_u: string, _f: unknown) => undefined),
  cleanupFingerprintCache: mock(() => undefined),
};

mock.module("@/features/images/services/image.service", () => ({
  ImageService: mockImageService,
}));
mock.module("@/features/images/services/hash.service", () => ({
  ImageHashService: mockHash,
}));
mock.module("@/features/images/services/fingerprint-cache", () => ({
  getOrComputeFingerprint: mockFingerprintCache.getOrComputeFingerprint,
  getCachedFingerprint: mockFingerprintCache.getCachedFingerprint,
  setCachedFingerprint: mockFingerprintCache.setCachedFingerprint,
  cleanupFingerprintCache: mockFingerprintCache.cleanupFingerprintCache,
}));
mock.module("@/db/connection", () => ({ db: {} }));
mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: async () => false,
  invalidateIgnoredCache: () => {},
}));

import { handlePuff } from "@/features/puff/handlers/puff.handler";
import {
  createMockMessage,
  createMockTextChannel,
  createMockGuild,
  createMockMember,
  createMockUser,
} from "../../mocks/discord";

function makeExecutor(overrides: { hasManageMessages?: boolean } = {}): GuildMember {
  const has = overrides.hasManageMessages ?? true;
  return {
    id: "executor-1",
    permissions: { has: (perm: string) => perm === "ManageMessages" && has },
  } as unknown as GuildMember;
}

function makeMessageWithImage(
  url = "https://x.com/i.png",
  content = "",
): Message {
  return createMockMessage({
    id: "msg-123",
    content,
    attachments: [{ url, contentType: "image/png" }],
  });
}

function setupGuildWithChannels(
  msg: Message,
  extraChannels: Array<{ id: string; name: string; messages: Message[] }>,
  options: { mockMemberFetch?: boolean } = {},
) {
  const channels = new Map();
  for (const c of extraChannels) {
    const channel = createMockTextChannel({
      id: c.id,
      name: c.name,
      messagesFetchResult: new Map(c.messages.map((m) => [m.id, m])),
    });
    channels.set(c.id, channel);
  }
  const me = {
    roles: { cache: { size: 1 }, highest: { position: 10 } },
    permissions: { has: () => true },
    fetch: mock(() => Promise.resolve()),
  };
  const guild = createMockGuild({ id: "g1", channels, me });
  if (options.mockMemberFetch) {
    (guild.members as unknown as { fetch: (...a: unknown[]) => Promise<unknown> }).fetch = mock(async (id: string) => {
      const { createMockMember } = await import("../../mocks/discord");
      return createMockMember({ id: String(id), moderatable: true });
    });
  }
  (msg as unknown as { guild: unknown }).guild = guild;
  return { guild, channels };
}

function makeAuthoredMessage(opts: {
  id: string;
  content?: string;
  attachments?: Array<{ url: string; contentType?: string }>;
  authorId?: string;
  bot?: boolean;
  channelId?: string;
}): Message {
  return createMockMessage({
    id: opts.id,
    content: opts.content ?? "",
    attachments: opts.attachments ?? [],
    author: {
      id: opts.authorId ?? "author-" + opts.id,
      bot: opts.bot ?? false,
    },
    channelId: opts.channelId ?? "222222222222222222",
  });
}

describe("handlePuff", () => {
  beforeEach(() => {
    mockImageService.addImage.mockClear();
    mockImageService.addImage.mockImplementation(
      async (_g: string, _n: string, _u: string) => undefined,
    );
    mockHash.downloadFingerprint.mockClear();
    mockHash.downloadFingerprint.mockImplementation(async (_u: string) => ({
      dhash: "h",
      phash: "p",
      ahash: "a",
      colorSig: "ff00aa",
      width: 100,
      height: 100,
    }));
    mockFingerprintCache.getOrComputeFingerprint.mockClear();
    mockFingerprintCache.getOrComputeFingerprint.mockImplementation(
      async (_u: string, compute: () => Promise<{ dhash: string } | null>) => {
        return compute();
      },
    );
  });

  it("returns no_permission when executor lacks ManageMessages", async () => {
    const target = makeMessageWithImage();
    const result = await handlePuff(target, makeExecutor({ hasManageMessages: false }));
    expect(result.kind).toBe("no_permission");
    expect(mockImageService.addImage).not.toHaveBeenCalled();
  });

  it("returns bot_author when target is the bot itself", async () => {
    const target = createMockMessage({
      id: "msg-self",
      author: { id: "self-bot-id", bot: true },
      attachments: [{ url: "https://x.com/i.png", contentType: "image/png" }],
    });
    (target as unknown as { client: { user: { id: string } } }).client = {
      user: { id: "self-bot-id" },
    };
    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("bot_author");
  });

  it("returns no_content when message has no images and no text", async () => {
    const target = createMockMessage({
      id: "msg-empty",
      content: "   ",
      attachments: [{ url: "https://x.com/file.pdf", contentType: "application/pdf" }],
    });
    setupGuildWithChannels(target, []);
    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("no_content");
  });

  it("returns success with 0 addedImages for pure-text content", async () => {
    const target = makeAuthoredMessage({
      id: "msg-text",
      content: "spam spam spam",
      authorId: "author-1",
      channelId: "ch-1",
    });
    setupGuildWithChannels(target, [
      { id: "ch-1", name: "general", messages: [target] },
    ], { mockMemberFetch: true });
    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.contentKind).toBe("text");
      expect(result.addedImages).toBe(0);
      expect(result.deletedMessages).toBe(1);
      expect(result.scannedChannels).toBeGreaterThanOrEqual(1);
      expect(result.timedOutAuthors).toBe(1);
      expect(result.totalOffenders).toBe(1);
    }
    expect(mockImageService.addImage).not.toHaveBeenCalled();
  });

  it("detects image URL from content", async () => {
    const target = makeAuthoredMessage({
      id: "msg-url",
      content: "look https://x.com/img.png here",
      authorId: "author-1",
    });
    setupGuildWithChannels(target, []);
    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    expect(mockImageService.addImage).toHaveBeenCalledTimes(1);
    if (result.kind === "success") {
      expect(result.contentKind).toBe("image");
      expect(result.addedImages).toBe(1);
    }
  });

  it("adds image to db on success", async () => {
    const target = makeMessageWithImage("https://x.com/img.png");
    setupGuildWithChannels(target, []);
    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.addedImages).toBe(1);
    }
    expect(mockImageService.addImage).toHaveBeenCalledTimes(1);
    expect(mockImageService.addImage).toHaveBeenCalledWith(
      "g1",
      "puff-msg-123-0",
      "https://x.com/img.png",
    );
  });

  it("skips image that already exists in db", async () => {
    mockImageService.addImage.mockImplementationOnce(async () => {
      throw new Error("Image with hash h already exists in this server");
    });
    const target = makeMessageWithImage("https://x.com/dup.png");
    setupGuildWithChannels(target, []);
    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.addedImages).toBe(0);
    }
  });

  it("adds multiple images from attachments and content", async () => {
    const target = createMockMessage({
      id: "msg-multi",
      content: "see https://x.com/b.png",
      attachments: [
        { url: "https://x.com/a.png", contentType: "image/png" },
        { url: "https://x.com/c.png", contentType: "image/png" },
      ],
    });
    setupGuildWithChannels(target, []);
    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.addedImages).toBe(3);
    }
  });

  it("scans other channels and deletes duplicate text messages from different authors", async () => {
    const target = makeAuthoredMessage({
      id: "msg-orig",
      content: "spam spam spam",
      authorId: "bot-1",
      bot: true,
      channelId: "ch-1",
    });
    const dup1 = makeAuthoredMessage({
      id: "dup-1",
      content: "spam spam spam",
      authorId: "bot-2",
      bot: true,
      channelId: "ch-2",
    });
    const dup2 = makeAuthoredMessage({
      id: "dup-2",
      content: "spam spam spam",
      authorId: "bot-3",
      bot: true,
      channelId: "ch-3",
    });
    const other = makeAuthoredMessage({
      id: "other",
      content: "unrelated message",
      authorId: "user-9",
      channelId: "ch-2",
    });
    setupGuildWithChannels(target, [
      { id: "ch-1", name: "general", messages: [target] },
      { id: "ch-2", name: "spam", messages: [dup1, other] },
      { id: "ch-3", name: "offtopic", messages: [dup2] },
    ], { mockMemberFetch: true });

    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.contentKind).toBe("text");
      expect(result.deletedMessages).toBeGreaterThanOrEqual(3);
      expect(result.totalOffenders).toBe(3);
      expect(result.timedOutAuthors).toBe(3);
      expect(result.scannedChannels).toBe(3);
    }
    expect(dup1.delete).toHaveBeenCalled();
    expect(dup2.delete).toHaveBeenCalled();
    expect(other.delete).not.toHaveBeenCalled();
  });

  it("does not duplicate timeout when author posts same message in multiple channels", async () => {
    const target = makeAuthoredMessage({
      id: "msg-orig",
      content: "spam spam spam",
      authorId: "bot-1",
      bot: true,
      channelId: "ch-1",
    });
    const dup = makeAuthoredMessage({
      id: "dup-1",
      content: "spam spam spam",
      authorId: "bot-1",
      bot: true,
      channelId: "ch-2",
    });
    setupGuildWithChannels(target, [
      { id: "ch-1", name: "general", messages: [target] },
      { id: "ch-2", name: "spam", messages: [dup] },
    ], { mockMemberFetch: true });

    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.totalOffenders).toBe(1);
      expect(result.timedOutAuthors).toBe(1);
    }
  });

  it("continues scanning when timeout fails for an offender", async () => {
    const target = makeAuthoredMessage({
      id: "msg-orig",
      content: "spam spam spam",
      authorId: "bot-1",
      bot: true,
      channelId: "ch-1",
    });
    const dup = makeAuthoredMessage({
      id: "dup-1",
      content: "spam spam spam",
      authorId: "bot-2",
      bot: true,
      channelId: "ch-2",
    });
    const { guild } = setupGuildWithChannels(target, [
      { id: "ch-1", name: "general", messages: [target] },
      { id: "ch-2", name: "spam", messages: [dup] },
    ]);

    let fetchCount = 0;
    const originalFetch = (guild.members as unknown as { fetch: (...a: unknown[]) => Promise<unknown> }).fetch;
    (guild.members as unknown as { fetch: (...a: unknown[]) => Promise<unknown> }).fetch = mock(async (id: string) => {
      fetchCount++;
      if (fetchCount === 1) {
        throw new Error("Missing Permissions");
      }
      return createMockMember({ id: String(id) });
    });

    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.totalOffenders).toBe(2);
      expect(result.timedOutAuthors).toBe(1);
    }
  });

  it("text duplicate detection is case-sensitive", async () => {
    const target = makeAuthoredMessage({
      id: "msg-orig",
      content: "Spam Spam Spam",
      authorId: "bot-1",
      bot: true,
      channelId: "ch-1",
    });
    const differentCase = makeAuthoredMessage({
      id: "dup-1",
      content: "spam spam spam",
      authorId: "bot-2",
      bot: true,
      channelId: "ch-2",
    });
    setupGuildWithChannels(target, [
      { id: "ch-1", name: "general", messages: [target] },
      { id: "ch-2", name: "spam", messages: [differentCase] },
    ], { mockMemberFetch: true });

    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.totalOffenders).toBe(1);
      expect(result.timedOutAuthors).toBe(1);
    }
    expect(differentCase.delete).not.toHaveBeenCalled();
  });

  it("detects duplicate images by dhash even with different URLs", async () => {
    const target = makeAuthoredMessage({
      id: "msg-orig",
      content: "",
      attachments: [{ url: "https://cdn.discord.com/target-image.png", contentType: "image/png" }],
      authorId: "bot-1",
      bot: true,
      channelId: "ch-1",
    });
    const duplicate = makeAuthoredMessage({
      id: "dup-1",
      content: "",
      attachments: [{ url: "https://cdn.discord.com/different-url.png", contentType: "image/png" }],
      authorId: "bot-2",
      bot: true,
      channelId: "ch-2",
    });

    let callCount = 0;
    mockFingerprintCache.getOrComputeFingerprint.mockImplementation(
      async (_u: string, compute: () => Promise<{ dhash: string } | null>) => {
        callCount++;
        return { dhash: "same-dhash-for-all" };
      },
    );

    setupGuildWithChannels(target, [
      { id: "ch-1", name: "general", messages: [target] },
      { id: "ch-2", name: "spam", messages: [duplicate] },
    ], { mockMemberFetch: true });

    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.totalOffenders).toBe(2);
      expect(result.timedOutAuthors).toBe(2);
    }
    expect(duplicate.delete).toHaveBeenCalled();
  });

  it("does not detect images with different dhash as duplicates", async () => {
    const target = makeAuthoredMessage({
      id: "msg-orig",
      content: "",
      attachments: [{ url: "https://cdn.discord.com/target-image.png", contentType: "image/png" }],
      authorId: "bot-1",
      bot: true,
      channelId: "ch-1",
    });
    const differentImage = makeAuthoredMessage({
      id: "diff-1",
      content: "",
      attachments: [{ url: "https://cdn.discord.com/different-image.png", contentType: "image/png" }],
      authorId: "bot-2",
      bot: true,
      channelId: "ch-2",
    });

    let callCount = 0;
    mockFingerprintCache.getOrComputeFingerprint.mockImplementation(
      async (url: string, compute: () => Promise<{ dhash: string } | null>) => {
        callCount++;
        if (url.includes("target")) {
          return { dhash: "target-dhash" };
        }
        return { dhash: "different-dhash" };
      },
    );

    setupGuildWithChannels(target, [
      { id: "ch-1", name: "general", messages: [target] },
      { id: "ch-2", name: "spam", messages: [differentImage] },
    ], { mockMemberFetch: true });

    const result = await handlePuff(target, makeExecutor());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.totalOffenders).toBe(1);
      expect(result.timedOutAuthors).toBe(1);
    }
    expect(differentImage.delete).not.toHaveBeenCalled();
  });
});
