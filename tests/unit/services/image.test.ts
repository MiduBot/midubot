import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();

const fingerprint = {
  dhash: "10101010",
  phash: "01010101",
  ahash: "11110000",
  colorSig: "ff00aa",
  width: 100,
  height: 100,
};

const mockHashService = {
  downloadFingerprint: mock(async (_url: string) => fingerprint),
  downloadAndHash: mock(async (_url: string) => fingerprint.dhash),
  compareFingerprints: mock((_a: unknown, _b: unknown) => ({
    isSimilar: true,
    confidence: 95,
    details: {
      dhashDist: 2,
      phashDist: 1,
      ahashDist: 1,
      colorDist: 5,
      aspectDiff: 0,
      votes: 3,
      mode: "ensemble",
    },
  })),
  compareLegacyDHash: mock((_a: string, _b: string) => ({
    isSimilar: true,
    confidence: 90,
    details: {
      dhashDist: 3,
      phashDist: -1,
      ahashDist: -1,
      colorDist: -1,
      aspectDiff: -1,
      votes: 1,
      mode: "legacy",
    },
  })),
};

mock.module("@/db/connection", () => ({ db }));
mock.module("@/features/images/services/hash.service", () => ({
  ImageHashService: mockHashService,
}));

import { ImageService } from "@/features/images";

describe("ImageService", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
    mockHashService.downloadFingerprint.mockClear();
    mockHashService.downloadAndHash.mockClear();
  });

  describe("addImage", () => {
    it("inserts image with fingerprint", async () => {
      setQueryResult("findFirst", null);
      setMutationResult("insert", undefined);
      await ImageService.addImage("g1", "name", "https://x.com/i.png");
    });

    it("throws when image already exists", async () => {
      setQueryResult("findFirst", { id: 1, hash: "10101010" });
      await expect(
        ImageService.addImage("g1", "name", "https://x.com/i.png"),
      ).rejects.toThrow(/already exists/);
    });

    it("throws when fingerprint is null", async () => {
      mockHashService.downloadFingerprint.mockImplementationOnce(async () => null);
      await expect(
        ImageService.addImage("g1", "name", "https://x.com/i.png"),
      ).rejects.toThrow();
    });
  });

  describe("listImages", () => {
    it("returns mapped images", async () => {
      setQueryResult("findMany", [
        {
          id: 1,
          guildId: "g1",
          hash: "aaa",
          phash: "bbb",
          ahash: "ccc",
          colorSig: "ff00aa",
          width: 100,
          height: 100,
          url: "https://x.com/i.png",
          name: "test",
        },
      ]);
      const list = await ImageService.listImages("g1");
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("test");
    });

    it("caches results", async () => {
      setQueryResult("findMany", []);
      await ImageService.listImages("g1");
      setQueryResult("findMany", [
        {
          id: 1,
          guildId: "g1",
          hash: "a",
          phash: null,
          ahash: null,
          colorSig: null,
          width: null,
          height: null,
          url: "u",
          name: "n",
        },
      ]);
      const cached = await ImageService.listImages("g1");
      expect(cached).toHaveLength(0);
    });
  });

  describe("removeImage", () => {
    it("removes by name", async () => {
      setQueryResult("findFirst", { id: 1 });
      setMutationResult("delete", { rowsAffected: 1 });
      await ImageService.removeImage("g1", "Test");
    });

    it("throws when not found", async () => {
      setQueryResult("findFirst", null);
      await expect(ImageService.removeImage("g1", "X")).rejects.toThrow(
        /not found/,
      );
    });
  });

  describe("removeImageByHash", () => {
    it("removes by hash", async () => {
      setQueryResult("findFirst", { id: 1 });
      setMutationResult("delete", { rowsAffected: 1 });
      await ImageService.removeImageByHash("g1", "aaa");
    });

    it("throws when hash not found", async () => {
      setQueryResult("findFirst", null);
      await expect(
        ImageService.removeImageByHash("g1", "xxx"),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("findSimilarImages", () => {
    it("returns matches sorted by distance", async () => {
      setQueryResult("findMany", [
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
        {
          id: 2,
          guildId: "g1",
          hash: "h2",
          phash: null,
          ahash: null,
          colorSig: null,
          width: null,
          height: null,
          url: "u2",
          name: "n2",
        },
      ]);
      const r = await ImageService.findSimilarImages("g1", "test");
      expect(r.length).toBe(2);
    });
  });

  describe("findSimilarImagesByFingerprint", () => {
    it("uses ensemble when fingerprint complete", async () => {
      setQueryResult("findMany", [
        {
          id: 1,
          guildId: "g1",
          hash: "h1",
          phash: "p1",
          ahash: "a1",
          colorSig: "ff",
          width: 100,
          height: 100,
          url: "u1",
          name: "n1",
        },
      ]);
      const r = await ImageService.findSimilarImagesByFingerprint(
        "g1",
        fingerprint,
      );
      expect(r).toHaveLength(1);
      expect(r[0].similarity.details.mode).toBe("ensemble");
    });

    it("falls back to legacy when fingerprint incomplete", async () => {
      setQueryResult("findMany", [
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
      const r = await ImageService.findSimilarImagesByFingerprint(
        "g1",
        fingerprint,
      );
      expect(r).toHaveLength(1);
      expect(r[0].similarity.details.mode).toBe("legacy");
    });
  });

  describe("migrateImageFingerprints", () => {
    it("migrates pending and reports progress", async () => {
      setQueryResult("findMany", [
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
      setMutationResult("update", undefined);
      const progress: Array<[number, number]> = [];
      const r = await ImageService.migrateImageFingerprints(
        "g1",
        (cur, tot) => progress.push([cur, tot]),
      );
      expect(r.total).toBe(1);
      expect(r.migrated).toBe(1);
      expect(r.failed).toBe(0);
      expect(progress).toEqual([[1, 1]]);
    });

    it("reports failures when download fails", async () => {
      setQueryResult("findMany", [
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
      mockHashService.downloadFingerprint.mockImplementationOnce(
        async () => null,
      );
      const r = await ImageService.migrateImageFingerprints("g1");
      expect(r.failed).toBe(1);
      expect(r.failures[0].reason).toBe("download/hash failed");
    });

    it("skips images already up-to-date", async () => {
      setQueryResult("findMany", [
        {
          id: 1,
          guildId: "g1",
          hash: "h1",
          phash: "p1",
          ahash: "a1",
          colorSig: "ff",
          width: 100,
          height: 100,
          url: "u1",
          name: "n1",
        },
      ]);
      const r = await ImageService.migrateImageFingerprints("g1");
      expect(r.alreadyMigrated).toBe(1);
      expect(r.migrated).toBe(0);
    });
  });
});
