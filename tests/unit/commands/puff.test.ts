import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

const mockImageService = {
  addImage: mock(async (_g: string, _n: string, _u: string) => undefined),
  removeImage: mock(async () => undefined),
  removeImageByHash: mock(async () => undefined),
  listImages: mock(async () => []),
  findSimilarImagesByFingerprint: mock(async () => []),
  findSimilarImages: mock(async () => []),
  migrateImageFingerprints: mock(async () => ({
    total: 0,
    alreadyMigrated: 0,
    migrated: 0,
    failed: 0,
    failures: [],
  })),
};

const mockHash = {
  downloadFingerprint: mock(async () => ({
    dhash: "h",
    phash: "p",
    ahash: "a",
    colorSig: "ff00aa",
    width: 100,
    height: 100,
  })),
  downloadAndHash: mock(async () => "h"),
};

mock.module("@/features/images/services/image.service", () => ({
  ImageService: mockImageService,
}));
mock.module("@/features/images/services/hash.service", () => ({
  ImageHashService: mockHash,
}));

import { handlePuffContextMenu } from "@/features/puff/commands/puff-context.command";

function makeInteraction(opts: {
  hasManageMessages?: boolean;
  fetchFails?: boolean;
  targetHasImage?: boolean;
  targetIsBot?: boolean;
  targetContent?: string;
}) {
  const has = opts.hasManageMessages ?? true;
  const member = {
    id: "executor-1",
    permissions: { has: (perm: string) => perm === "ManageMessages" && has },
  };
  const channelStub = {
    id: "ch-x",
    type: 0,
    name: "general",
    viewable: true,
    isTextBased: () => true,
    messages: {
      fetch: mock(async () => new Map()),
    },
  };
  const guild = {
    id: "g1",
    members: {
      fetch: opts.fetchFails
        ? mock(async () => {
            throw new Error("Unknown Member");
          })
        : mock(async () => member),
    },
    channels: {
      fetch: mock(async () => new Map([[channelStub.id, channelStub]])),
    },
  };
  const attachments = opts.targetHasImage
    ? new Map([
        [
          "https://x.com/i.png",
          { url: "https://x.com/i.png", contentType: "image/png" },
        ],
      ])
    : new Map();
  const targetMessage = createMockMessage({
    id: "msg-1",
    author: {
      id: opts.targetIsBot ? "bot-1" : "author-1",
      bot: opts.targetIsBot ?? false,
    },
    content: opts.targetContent ?? "",
    attachments: [...attachments.values()].map((a) => ({
      url: a.url,
      contentType: a.contentType,
    })),
  });
  (targetMessage as unknown as { guild: unknown }).guild = guild;
  return {
    guild,
    user: { id: "executor-1" },
    targetMessage,
    commandName: "Puff",
    reply: mock(() => Promise.resolve()),
    editReply: mock(() => Promise.resolve()),
    deleteReply: mock(() => Promise.resolve()),
    deferReply: mock(() => Promise.resolve()),
  } as never;
}

describe("handlePuffContextMenu", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
    setTableResult("guildConfigsTable", "findFirst", { language: "es" });
    mockImageService.addImage.mockClear();
    mockImageService.addImage.mockImplementation(async () => undefined);
    mockHash.downloadFingerprint.mockClear();
    mockHash.downloadFingerprint.mockImplementation(async () => ({
      dhash: "h",
      phash: "p",
      ahash: "a",
      colorSig: "ff00aa",
      width: 100,
      height: 100,
    }));
  });

  it("replies with no_permission when member fetch fails", async () => {
    const i = makeInteraction({ fetchFails: true });
    await handlePuffContextMenu(i);
    expect(i.reply).toHaveBeenCalled();
  });

  it("replies with no_permission when user lacks ManageMessages", async () => {
    const i = makeInteraction({ hasManageMessages: false });
    await handlePuffContextMenu(i);
    expect(i.reply).toHaveBeenCalled();
  });

  it("replies bot_author when target is the bot itself", async () => {
    const i = makeInteraction({ targetIsBot: true });
    const targetMessage = (i as unknown as { targetMessage: { client?: { user?: { id: string } } } }).targetMessage;
    targetMessage.client = { user: { id: targetMessage.author.id } };
    await handlePuffContextMenu(i);
    expect(i.deferReply).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
  });

  it("edits reply with summary when target has no images and no text", async () => {
    const i = makeInteraction({ targetContent: "   " });
    await handlePuffContextMenu(i);
    expect(i.deferReply).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
    const editReply = (i.editReply as unknown as { mock: { calls: unknown[][] } }).mock;
    const content = (editReply.calls[0]?.[0] as { content: string }).content;
    expect(content).toContain("El mensaje no contiene");
  });

  it("edits reply with text-summary when target has text", async () => {
    const i = makeInteraction({ targetContent: "spam spam" });
    await handlePuffContextMenu(i);
    expect(i.deferReply).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
    const editReply = (i.editReply as unknown as { mock: { calls: unknown[][] } }).mock;
    const content = (editReply.calls[0]?.[0] as { content: string }).content;
    expect(content).toContain("Puff aplicado");
    expect(content).toContain("autores con timeout");
    expect(mockImageService.addImage).not.toHaveBeenCalled();
  });

  it("edits reply with image-summary and adds image when target has image", async () => {
    const i = makeInteraction({ targetHasImage: true });
    await handlePuffContextMenu(i);
    expect(i.deferReply).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
    expect(mockImageService.addImage).toHaveBeenCalled();
    const editReply = (i.editReply as unknown as { mock: { calls: unknown[][] } }).mock;
    const content = (editReply.calls[0]?.[0] as { content: string }).content;
    expect(content).toContain("imagen(es) agregadas");
  });
});
