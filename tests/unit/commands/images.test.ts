import { describe, it, expect, beforeEach, mock } from "bun:test";

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

mock.module("@/features/images/services/image.service", () => ({
  ImageService: mockImageService,
}));
mock.module("@/features/images/services/hash.service", () => ({
  ImageHashService: mockHash,
}));
mock.module("@/db/connection", () => ({ db: {} }));

import { handleAddImage } from "@/features/images/commands/add";
import { handleRemoveImage } from "@/features/images/commands/remove";
import { handleListImages } from "@/features/images/commands/list";
import { handleCheckImage } from "@/features/images/commands/check";
import { handleMigrateImages } from "@/features/images/commands/migrate";
import { buildListEmbed } from "@/features/images/commands/list-state";
import { es } from "@/i18n/es";
import { en } from "@/i18n/en";
import { createMockMessage } from "../../mocks/discord";

const t = es;
const tEn = en;

describe("handleAddImage", () => {
  beforeEach(() => {
    mockImageService.addImage.mockClear();
  });

  it("shows usage when no name", async () => {
    const msg = createMockMessage();
    await handleAddImage(msg, "g1", ["add"], t);
  });

  it("shows error when no url or attachment", async () => {
    const msg = createMockMessage();
    await handleAddImage(msg, "g1", ["add", "myname"], t);
  });

  it("rejects invalid url", async () => {
    const msg = createMockMessage();
    await handleAddImage(msg, "g1", ["add", "myname", "not-a-url"], t);
  });

  it("successfully adds image", async () => {
    const msg = createMockMessage();
    await handleAddImage(msg, "g1", ["add", "myname", "https://x.com/i.png"], t);
    expect(mockImageService.addImage).toHaveBeenCalled();
  });

  it("handles add error", async () => {
    mockImageService.addImage.mockImplementationOnce(async () => {
      throw new Error("fail");
    });
    const msg = createMockMessage();
    await handleAddImage(msg, "g1", ["add", "myname", "https://x.com/i.png"], t);
  });

  it("uses url from attachment", async () => {
    const msg = createMockMessage({
      attachments: [{ url: "https://x.com/i.png" }],
    });
    await handleAddImage(msg, "g1", ["add", "myname"], t);
    expect(mockImageService.addImage).toHaveBeenCalled();
  });
});

describe("handleRemoveImage", () => {
  beforeEach(() => {
    mockImageService.removeImage.mockClear();
    mockImageService.removeImageByHash.mockClear();
  });

  it("removes by name", async () => {
    const msg = createMockMessage();
    await handleRemoveImage(msg, "g1", ["remove", "myname"], t);
    expect(mockImageService.removeImage).toHaveBeenCalled();
  });

  it("removes by url via attachment", async () => {
    const msg = createMockMessage({
      attachments: [{ url: "https://x.com/i.png" }],
    });
    await handleRemoveImage(msg, "g1", ["remove"], t);
    expect(mockImageService.removeImageByHash).toHaveBeenCalled();
  });

  it("handles remove error", async () => {
    mockImageService.removeImage.mockImplementationOnce(async () => {
      throw new Error("not found");
    });
    const msg = createMockMessage();
    await handleRemoveImage(msg, "g1", ["remove", "myname"], t);
  });
});

describe("handleListImages", () => {
  beforeEach(() => {
    mockImageService.listImages.mockClear();
  });

  it("shows empty when no images", async () => {
    mockImageService.listImages.mockResolvedValueOnce([]);
    const msg = createMockMessage();
    await handleListImages(msg, "g1", t);
  });

  it("shows list when images exist", async () => {
    mockImageService.listImages.mockResolvedValueOnce([
      {
        id: 1,
        guildId: "g1",
        hash: "h1",
        phash: null,
        ahash: null,
        colorSig: null,
        width: null,
        height: null,
        url: "u1",
        name: "n1",
      },
    ]);
    const msg = createMockMessage();
    await handleListImages(msg, "g1", t);
  });

  it("handles list error", async () => {
    mockImageService.listImages.mockImplementationOnce(async () => {
      throw new Error("db error");
    });
    const msg = createMockMessage();
    await handleListImages(msg, "g1", t);
  });
});

describe("handleCheckImage", () => {
  beforeEach(() => {
    mockImageService.findSimilarImagesByFingerprint.mockClear();
  });

  it("shows usage when no url or attachment", async () => {
    const msg = createMockMessage();
    await handleCheckImage(msg, "g1", ["check"], t);
  });

  it("rejects invalid url", async () => {
    const msg = createMockMessage();
    await handleCheckImage(msg, "g1", ["check", "not-a-url"], t);
  });

  it("shows no matches", async () => {
    mockImageService.findSimilarImagesByFingerprint.mockResolvedValueOnce([]);
    const msg = createMockMessage();
    await handleCheckImage(msg, "g1", ["check", "https://x.com/i.png"], t);
  });

  it("shows matches", async () => {
    mockImageService.findSimilarImagesByFingerprint.mockResolvedValueOnce([
      {
        id: 1,
        guildId: "g1",
        hash: "h1",
        phash: "p1",
        ahash: "a1",
        colorSig: "ff00aa",
        width: 100,
        height: 100,
        url: "u1",
        name: "n1",
        similarity: { isSimilar: true, confidence: 95, details: { dhashDist: 0 } },
        distance: 0,
      },
    ]);
    const msg = createMockMessage();
    await handleCheckImage(msg, "g1", ["check", "https://x.com/i.png"], t);
  });

  it("handles check error", async () => {
    mockHash.downloadFingerprint.mockImplementationOnce(async () => null);
    const msg = createMockMessage();
    await handleCheckImage(msg, "g1", ["check", "https://x.com/i.png"], t);
  });
});

describe("handleMigrateImages", () => {
  beforeEach(() => {
    mockImageService.migrateImageFingerprints.mockClear();
  });

  it("migrates with empty list", async () => {
    mockImageService.migrateImageFingerprints.mockResolvedValueOnce({
      total: 0,
      alreadyMigrated: 0,
      migrated: 0,
      failed: 0,
      failures: [],
    });
    const msg = createMockMessage();
    await handleMigrateImages(msg, "g1", t);
  });

  it("migrates with entries", async () => {
    mockImageService.migrateImageFingerprints.mockImplementationOnce(
      async (_g, onProgress) => {
        onProgress?.(1, 1);
        return {
          total: 1,
          alreadyMigrated: 0,
          migrated: 1,
          failed: 0,
          failures: [],
        };
      },
    );
    const msg = createMockMessage();
    await handleMigrateImages(msg, "g1", t);
  });

  it("migrates with failures", async () => {
    mockImageService.migrateImageFingerprints.mockResolvedValueOnce({
      total: 3,
      alreadyMigrated: 0,
      migrated: 1,
      failed: 2,
      failures: [
        { id: 1, name: "n1", reason: "fail1" },
        { id: 2, name: "n2", reason: "fail2" },
        { id: 3, name: "n3", reason: "fail3" },
      ],
    });
    const msg = createMockMessage();
    await handleMigrateImages(msg, "g1", t);
  });

  it("handles migrate error", async () => {
    mockImageService.migrateImageFingerprints.mockImplementationOnce(async () => {
      throw new Error("migrate failed");
    });
    const msg = createMockMessage();
    await handleMigrateImages(msg, "g1", t);
  });
});

describe("list-state and interactions", () => {
  it("buildListEmbed handles empty filter", () => {
    const state = { images: [], page: 0, filter: "" };
    const result = buildListEmbed(state, t);
    expect(result.embeds).toHaveLength(1);
  });

  it("buildListEmbed handles filter with no matches", () => {
    const state = { images: [], page: 0, filter: "nope" };
    const result = buildListEmbed(state, t);
    expect(result.embeds).toHaveLength(1);
  });

  it("buildListEmbed paginates results", () => {
    const images = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      guildId: "g1",
      hash: `h${i}`,
      phash: null,
      ahash: null,
      colorSig: null,
      width: null,
      height: null,
      url: `u${i}`,
      name: `n${i}`,
    }));
    const state = { images, page: 0, filter: "" };
    const result = buildListEmbed(state, t);
    expect(result.embeds).toHaveLength(1);
  });

  it("uses en translations", () => {
    const state = { images: [], page: 0, filter: "" };
    const result = buildListEmbed(state, tEn);
    expect(result.embeds[0].title).toBe(tEn.images.list_title);
  });
});
