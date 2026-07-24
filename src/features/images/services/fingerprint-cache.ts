import type { ImageFingerprint } from "./hash.service";
import { appCache } from "@/core/cache";
import { logger } from "@/core/logger";

const TTL = 60 * 60 * 1000;
const PREFIX = "fingerprint:";

export function getCachedFingerprint(
  url: string,
): ImageFingerprint | undefined {
  return appCache.get<ImageFingerprint>(`${PREFIX}${url}`) ?? undefined;
}

export function setCachedFingerprint(
  url: string,
  fingerprint: ImageFingerprint,
): void {
  appCache.set(`${PREFIX}${url}`, fingerprint, TTL);
}

export async function getOrComputeFingerprint(
  url: string,
  compute: () => Promise<ImageFingerprint | null>,
): Promise<ImageFingerprint | null> {
  const cached = getCachedFingerprint(url);
  if (cached) return cached;

  const fingerprint = await compute();
  if (fingerprint) {
    setCachedFingerprint(url, fingerprint);
  }
  return fingerprint;
}

export function cleanupFingerprintCache(): void {
  logger.info(
    `Fingerprint cache cleanup: ${appCache.size()} entries remaining`,
  );
}

setInterval(cleanupFingerprintCache, 5 * 60 * 1000).unref();
