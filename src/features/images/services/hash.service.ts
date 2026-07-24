import sharp from "sharp";
import fetch from "node-fetch";
import { logger } from "@/core/logger";

export interface ImageFingerprint {
  dhash: string;
  phash: string;
  ahash: string;
  colorSig: string;
  width: number;
  height: number;
}

export interface SimilarityDetails {
  dhashDist: number;
  phashDist: number;
  ahashDist: number;
  colorDist: number;
  aspectDiff: number;
  votes: number;
  mode: "ensemble" | "legacy";
}

export interface SimilarityResult {
  isSimilar: boolean;
  confidence: number;
  details: SimilarityDetails;
}

const DHASH_THRESHOLD = 10;
const PHASH_THRESHOLD = 10;
const AHASH_THRESHOLD = 10;
const COLOR_THRESHOLD = 40;
const ASPECT_RATIO_TOLERANCE = 0.25;
const MIN_VOTES = 2;
const LEGACY_STRICT_THRESHOLD = 6;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export class ImageHashService {
  static async downloadFingerprint(
    url: string,
  ): Promise<ImageFingerprint | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.statusText} (${response.status}) at ${url}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;

      const [dhashPixels, phashPixels, ahashPixels, colorPixels] =
        await Promise.all([
          sharp(buffer)
            .resize(9, 8, { fit: "fill" })
            .grayscale()
            .toColourspace("b-w")
            .raw()
            .toBuffer(),
          sharp(buffer)
            .resize(32, 32, { fit: "fill" })
            .grayscale()
            .toColourspace("b-w")
            .raw()
            .toBuffer(),
          sharp(buffer)
            .resize(8, 8, { fit: "fill" })
            .grayscale()
            .toColourspace("b-w")
            .raw()
            .toBuffer(),
          sharp(buffer)
            .resize(4, 4, { fit: "fill" })
            .removeAlpha()
            .toColourspace("srgb")
            .raw()
            .toBuffer(),
        ]);

      return {
        dhash: this.computeDHash(dhashPixels),
        phash: this.computePHash(phashPixels),
        ahash: this.computeAHash(ahashPixels),
        colorSig: colorPixels.toString("hex"),
        width,
        height,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to process image at ${url}: ${msg}`);
      return null;
    }
  }

  static async downloadAndHash(url: string): Promise<string> {
    const fingerprint = await this.downloadFingerprint(url);
    return fingerprint?.dhash ?? "";
  }

  private static computeDHash(buffer: Buffer): string {
    let hash = "";
    for (let row = 0; row < 8; row++) {
      const base = row * 9;
      for (let col = 0; col < 8; col++) {
        hash += buffer[base + col] >= buffer[base + col + 1] ? "1" : "0";
      }
    }
    return hash;
  }

  private static computeAHash(buffer: Buffer): string {
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += buffer[i];
    const avg = sum / 64;
    let hash = "";
    for (let i = 0; i < 64; i++) {
      hash += buffer[i] >= avg ? "1" : "0";
    }
    return hash;
  }

  private static computePHash(buffer: Buffer): string {
    const N = 32;
    const cos = new Float64Array(N * 8);
    for (let x = 0; x < N; x++) {
      for (let u = 0; u < 8; u++) {
        cos[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
      }
    }

    const intermediate = new Float64Array(N * 8);
    for (let x = 0; x < N; x++) {
      const rowOffset = x * N;
      for (let v = 0; v < 8; v++) {
        let sum = 0;
        for (let y = 0; y < N; y++) {
          sum += buffer[rowOffset + y] * cos[y * 8 + v];
        }
        intermediate[x * 8 + v] = sum;
      }
    }

    const dct = new Float64Array(64);
    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        let sum = 0;
        for (let x = 0; x < N; x++) {
          sum += intermediate[x * 8 + v] * cos[x * 8 + u];
        }
        const au = u === 0 ? 1 / Math.SQRT2 : 1;
        const av = v === 0 ? 1 / Math.SQRT2 : 1;
        dct[u * 8 + v] = (sum * au * av * 2) / N;
      }
    }

    const ac = Array.from(dct.slice(1));
    ac.sort((a, b) => a - b);
    const median = ac[Math.floor(ac.length / 2)];

    let hash = "0";
    for (let i = 1; i < 64; i++) {
      hash += dct[i] >= median ? "1" : "0";
    }
    return hash;
  }

  static hammingDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) {
      return Number.MAX_VALUE;
    }
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
  }

  static calculateDistance(hash1: string, hash2: string): number {
    return this.hammingDistance(hash1, hash2);
  }

  static colorDistance(sig1: string, sig2: string): number {
    if (!sig1 || !sig2 || sig1.length !== sig2.length) return 255;
    try {
      const b1 = Buffer.from(sig1, "hex");
      const b2 = Buffer.from(sig2, "hex");
      if (b1.length !== b2.length || b1.length === 0) return 255;
      let sum = 0;
      for (let i = 0; i < b1.length; i++) {
        sum += Math.abs(b1[i] - b2[i]);
      }
      return sum / b1.length;
    } catch {
      return 255;
    }
  }

  static compareFingerprints(
    a: ImageFingerprint,
    b: ImageFingerprint,
  ): SimilarityResult {
    const dhashDist = this.hammingDistance(a.dhash, b.dhash);
    const phashDist = this.hammingDistance(a.phash, b.phash);
    const ahashDist = this.hammingDistance(a.ahash, b.ahash);
    const colorDist = this.colorDistance(a.colorSig, b.colorSig);

    let aspectDiff = 0;
    if (a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0) {
      const ratioA = a.width / a.height;
      const ratioB = b.width / b.height;
      aspectDiff = Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB);
    }

    let votes = 0;
    if (dhashDist <= DHASH_THRESHOLD) votes++;
    if (phashDist <= PHASH_THRESHOLD) votes++;
    if (ahashDist <= AHASH_THRESHOLD) votes++;

    const colorOk = colorDist <= COLOR_THRESHOLD;
    const aspectOk = aspectDiff <= ASPECT_RATIO_TOLERANCE;
    const isSimilar = votes >= MIN_VOTES && colorOk && aspectOk;

    const bestHashDist = Math.min(dhashDist, phashDist, ahashDist);
    const confidence = Math.max(
      0,
      Math.min(100, Math.round(((64 - bestHashDist) / 64) * 100)),
    );

    return {
      isSimilar,
      confidence,
      details: {
        dhashDist,
        phashDist,
        ahashDist,
        colorDist,
        aspectDiff,
        votes,
        mode: "ensemble",
      },
    };
  }

  static compareLegacyDHash(
    incomingDHash: string,
    storedDHash: string,
    threshold: number = LEGACY_STRICT_THRESHOLD,
  ): SimilarityResult {
    const dhashDist = this.hammingDistance(incomingDHash, storedDHash);
    const isSimilar = dhashDist <= threshold;
    const confidence = Math.max(
      0,
      Math.min(100, Math.round(((64 - dhashDist) / 64) * 100)),
    );
    return {
      isSimilar,
      confidence,
      details: {
        dhashDist,
        phashDist: -1,
        ahashDist: -1,
        colorDist: -1,
        aspectDiff: -1,
        votes: isSimilar ? 1 : 0,
        mode: "legacy",
      },
    };
  }

  static isSimilar(
    hash1: string,
    hash2: string,
    threshold: number = DHASH_THRESHOLD,
  ): boolean {
    return this.hammingDistance(hash1, hash2) <= threshold;
  }
}
