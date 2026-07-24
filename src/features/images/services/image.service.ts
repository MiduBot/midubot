import { db } from "@/db/connection";
import { imagesTable } from "@/db/schema";
import { appCache } from "@/core/cache";
import {
  ImageHashService,
  type ImageFingerprint,
  type SimilarityResult,
} from "./hash.service";
import { eq, and } from "drizzle-orm";
import { logger } from "@/core/logger";

const CACHE_PREFIX = "image:";

export interface StoredImage {
  id: number;
  hash: string;
  phash: string | null;
  ahash: string | null;
  colorSig: string | null;
  width: number | null;
  height: number | null;
  url: string;
  name: string;
}

export interface SimilarImageMatch extends StoredImage {
  similarity: SimilarityResult;
  distance: number;
}

export class ImageService {
  static async addImage(
    guildId: string,
    name: string,
    url: string,
  ): Promise<void> {
    try {
      const fingerprint = await ImageHashService.downloadFingerprint(url);

      if (!fingerprint || !fingerprint.dhash) {
        throw new Error(
          "No se pudo descargar o procesar el hash de la imagen. Verifica que la URL sea válida y accesible.",
        );
      }

      const existing = await db.query.imagesTable.findFirst({
        where: and(
          eq(imagesTable.guildId, guildId),
          eq(imagesTable.hash, fingerprint.dhash),
        ),
      });

      if (existing) {
        throw new Error(
          `Image with hash ${fingerprint.dhash} already exists in this server`,
        );
      }

      await db.insert(imagesTable).values({
        guildId,
        hash: fingerprint.dhash,
        phash: fingerprint.phash,
        ahash: fingerprint.ahash,
        colorSig: fingerprint.colorSig,
        width: fingerprint.width,
        height: fingerprint.height,
        url,
        name: name.toLowerCase(),
      });

      appCache.deleteByPrefix(`${CACHE_PREFIX}${guildId}:`);
      logger.info(`Image added successfully: ${name} in guild ${guildId}`);
    } catch (error) {
      logger.error(`Failed to add image ${name} in guild ${guildId}`, error);
      throw error;
    }
  }

  static async listImages(guildId: string): Promise<StoredImage[]> {
    try {
      const cacheKey = `${CACHE_PREFIX}${guildId}:all`;
      const cached = appCache.get<StoredImage[]>(cacheKey);
      if (cached) return cached;

      const images = await db.query.imagesTable.findMany({
        where: eq(imagesTable.guildId, guildId),
      });

      const typed: StoredImage[] = images.map((img) => ({
        id: img.id,
        hash: img.hash,
        phash: img.phash ?? null,
        ahash: img.ahash ?? null,
        colorSig: img.colorSig ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
        url: img.url,
        name: img.name,
      }));

      appCache.set(cacheKey, typed);
      return typed;
    } catch (error) {
      logger.error(`Failed to list images for guild ${guildId}`, error);
      throw error;
    }
  }

  static async removeImage(guildId: string, name: string): Promise<void> {
    try {
      const normalizedName = name.toLowerCase();

      const image = await db.query.imagesTable.findFirst({
        where: and(
          eq(imagesTable.guildId, guildId),
          eq(imagesTable.name, normalizedName),
        ),
      });

      if (!image) {
        throw new Error(`Image not found: ${name}`);
      }

      await db
        .delete(imagesTable)
        .where(
          and(
            eq(imagesTable.guildId, guildId),
            eq(imagesTable.name, normalizedName),
          ),
        );

      appCache.deleteByPrefix(`${CACHE_PREFIX}${guildId}:`);
      logger.info(`Image removed: ${name} in guild ${guildId}`);
    } catch (error) {
      logger.error(`Failed to remove image ${name} in guild ${guildId}`, error);
      throw error;
    }
  }

  static async removeImageByHash(guildId: string, hash: string): Promise<void> {
    try {
      const image = await db.query.imagesTable.findFirst({
        where: and(
          eq(imagesTable.guildId, guildId),
          eq(imagesTable.hash, hash),
        ),
      });

      if (!image) {
        throw new Error(`Image with hash ${hash} not found`);
      }

      await db
        .delete(imagesTable)
        .where(
          and(eq(imagesTable.guildId, guildId), eq(imagesTable.hash, hash)),
        );

      appCache.deleteByPrefix(`${CACHE_PREFIX}${guildId}:`);
      logger.info(`Image removed by hash: ${hash}`);
    } catch (error) {
      logger.error(`Failed to remove image by hash ${hash}`, error);
      throw error;
    }
  }

  static async migrateImageFingerprints(
    guildId: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{
    total: number;
    alreadyMigrated: number;
    migrated: number;
    failed: number;
    failures: Array<{ id: number; name: string; reason: string }>;
  }> {
    const images = await this.listImages(guildId);

    const pending = images.filter(
      (img) =>
        !img.phash ||
        !img.ahash ||
        !img.colorSig ||
        img.width === null ||
        img.height === null,
    );

    const alreadyMigrated = images.length - pending.length;
    let migrated = 0;
    const failures: Array<{ id: number; name: string; reason: string }> = [];

    for (let i = 0; i < pending.length; i++) {
      const img = pending[i];

      try {
        const fp = await ImageHashService.downloadFingerprint(img.url);
        if (!fp || !fp.dhash) {
          failures.push({
            id: img.id,
            name: img.name,
            reason: "download/hash failed",
          });
          continue;
        }

        await db
          .update(imagesTable)
          .set({
            hash: fp.dhash,
            phash: fp.phash,
            ahash: fp.ahash,
            colorSig: fp.colorSig,
            width: fp.width,
            height: fp.height,
          })
          .where(
            and(eq(imagesTable.guildId, guildId), eq(imagesTable.id, img.id)),
          );

        migrated++;
        onProgress?.(migrated, pending.length);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        failures.push({
          id: img.id,
          name: img.name,
          reason,
        });
      }
    }

    appCache.deleteByPrefix(`${CACHE_PREFIX}${guildId}:`);
    logger.info(
      `Image fingerprint migration finished for guild ${guildId}: ` +
        `${migrated} migrated, ${failures.length} failed, ${alreadyMigrated} already up-to-date`,
    );

    return {
      total: images.length,
      alreadyMigrated,
      migrated,
      failed: failures.length,
      failures,
    };
  }

  static async findSimilarImagesByFingerprint(
    guildId: string,
    fingerprint: ImageFingerprint,
  ): Promise<SimilarImageMatch[]> {
    try {
      const images = await this.listImages(guildId);
      const matches: SimilarImageMatch[] = [];

      for (const img of images) {
        const hasFullFingerprint =
          !!img.phash &&
          !!img.ahash &&
          !!img.colorSig &&
          img.width !== null &&
          img.height !== null;

        let similarity: SimilarityResult;
        if (hasFullFingerprint) {
          similarity = ImageHashService.compareFingerprints(fingerprint, {
            dhash: img.hash,
            phash: img.phash!,
            ahash: img.ahash!,
            colorSig: img.colorSig!,
            width: img.width!,
            height: img.height!,
          });
        } else {
          similarity = ImageHashService.compareLegacyDHash(
            fingerprint.dhash,
            img.hash,
          );
        }

        if (!similarity.isSimilar) continue;

        matches.push({
          ...img,
          similarity,
          distance: similarity.details.dhashDist,
        });
      }

      matches.sort((a, b) => a.distance - b.distance);
      return matches;
    } catch (error) {
      logger.error("Failed to find similar images", error);
      throw error;
    }
  }

  static async findSimilarImages(
    guildId: string,
    hash: string,
    threshold: number = 6,
  ): Promise<
    Array<{
      id: number;
      hash: string;
      url: string;
      name: string;
      distance: number;
    }>
  > {
    try {
      const images = await this.listImages(guildId);

      return images
        .map((img) => {
          const similarity = ImageHashService.compareLegacyDHash(
            hash,
            img.hash,
            threshold,
          );
          return {
            id: img.id,
            hash: img.hash,
            url: img.url,
            name: img.name,
            distance: similarity.details.dhashDist,
            isSimilar: similarity.isSimilar,
          };
        })
        .filter((img) => img.isSimilar)
        .map(({ isSimilar: _s, ...rest }) => rest);
    } catch (error) {
      logger.error("Failed to find similar images", error);
      throw error;
    }
  }
}
