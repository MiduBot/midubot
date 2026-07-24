export interface CachedSanction {
  firstCaseId: number;
  firstChannelId: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 600_000;
const store = new Map<string, CachedSanction>();

function key(guildId: string, authorId: string): string {
  return `${guildId}:${authorId}`;
}

export class SanctionCache {
  static get(guildId: string, authorId: string): CachedSanction | null {
    const k = key(guildId, authorId);
    const v = store.get(k);
    if (!v) return null;
    if (v.expiresAt <= Date.now()) {
      store.delete(k);
      return null;
    }
    return v;
  }

  static set(
    guildId: string,
    authorId: string,
    firstCaseId: number,
    firstChannelId: string,
    ttlMs: number = DEFAULT_TTL_MS,
  ): void {
    store.set(key(guildId, authorId), {
      firstCaseId,
      firstChannelId,
      expiresAt: Date.now() + ttlMs,
    });
    SanctionCache.prune();
  }

  static prune(): void {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k);
    }
  }

  static _resetForTests(): void {
    store.clear();
  }
}
