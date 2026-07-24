import { createHash } from "node:crypto";
import { db } from "@/db/connection";
import {
  linkCooldownChannelsTable,
  linkCooldownEntriesTable,
} from "@/db/schema";
import { appCache } from "@/core/cache";
import { and, eq, gte, sql, desc, count } from "drizzle-orm";
import { logger } from "@/core/logger";

const CACHE_PREFIX = "linkcd:";
const CHANNEL_TTL_MS = 5 * 60 * 1000;

export type LinkCooldownMode = "same" | "any";

export interface LinkCooldownConfig {
  guildId: string;
  channelId: string;
  mode: LinkCooldownMode;
  maxLinks: number;
  windowMs: number;
  enabled: boolean;
}

export interface CheckResult {
  allowed: boolean;
  blockedUrl?: string;
  reason?: "same_duplicate" | "rate_limit";
  retryAfterMs?: number;
  recordedCount?: number;
}

const TRACKING_PARAM_RE =
  /^utm_|fbclid|^gclid$|^ref$|^mc_|^_ga|^_gl|igshid|mkt_tok$/i;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.replace(/\/+$/, "");
    }
    const params: [string, string][] = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (TRACKING_PARAM_RE.test(k)) continue;
      params.push([k, v]);
    }
    params.sort(([a], [b]) => a.localeCompare(b));
    const qs = params.map(([k, v]) => `${k}=${v}`).join("&");
    return `${u.protocol}//${host}${pathname}${qs ? `?${qs}` : ""}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

export function parseDuration(input: string): number | null {
  const re = /^(\d+)\s*(ms|s|m|h|d)$/i;
  const m = re.exec(input.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const mult =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1000
        : unit === "m"
          ? 60 * 1000
          : unit === "h"
            ? 60 * 60 * 1000
            : 24 * 60 * 60 * 1000;
  return n * mult;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.floor(ms)}ms`;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function configKey(guildId: string, channelId: string): string {
  return `${CACHE_PREFIX}cfg:${guildId}:${channelId}`;
}

function listKey(guildId: string): string {
  return `${CACHE_PREFIX}list:${guildId}`;
}

function invalidate(guildId: string, channelId?: string): void {
  appCache.delete(listKey(guildId));
  if (channelId) appCache.delete(configKey(guildId, channelId));
  else appCache.deleteByPrefix(`${CACHE_PREFIX}cfg:${guildId}:`);
}

export class LinkCooldownService {
  static async getChannelConfig(
    guildId: string,
    channelId: string,
  ): Promise<LinkCooldownConfig | null> {
    const ck = configKey(guildId, channelId);
    if (appCache.has(ck)) return appCache.get<LinkCooldownConfig | null>(ck);

    const row = await db.query.linkCooldownChannelsTable.findFirst({
      where: and(
        eq(linkCooldownChannelsTable.guildId, guildId),
        eq(linkCooldownChannelsTable.channelId, channelId),
      ),
    });

    const config: LinkCooldownConfig | null = row
      ? {
          guildId: row.guildId,
          channelId: row.channelId,
          mode: row.mode as LinkCooldownMode,
          maxLinks: row.maxLinks,
          windowMs: row.windowMs,
          enabled: row.enabled,
        }
      : null;

    appCache.set(ck, config, CHANNEL_TTL_MS);
    return config;
  }

  static async listChannels(guildId: string): Promise<LinkCooldownConfig[]> {
    const cached = appCache.get<LinkCooldownConfig[]>(listKey(guildId));
    if (cached) return cached;

    const rows = await db.query.linkCooldownChannelsTable.findMany({
      where: eq(linkCooldownChannelsTable.guildId, guildId),
      orderBy: (t, { asc }) => [asc(t.channelId)],
    });

    const list: LinkCooldownConfig[] = rows.map((r) => ({
      guildId: r.guildId,
      channelId: r.channelId,
      mode: r.mode as LinkCooldownMode,
      maxLinks: r.maxLinks,
      windowMs: r.windowMs,
      enabled: r.enabled,
    }));

    appCache.set(listKey(guildId), list, CHANNEL_TTL_MS);
    return list;
  }

  static async addChannel(
    guildId: string,
    channelId: string,
    opts?: { mode?: LinkCooldownMode; maxLinks?: number; windowMs?: number },
  ): Promise<LinkCooldownConfig> {
    const mode = opts?.mode ?? "same";
    const maxLinks = opts?.maxLinks ?? (mode === "any" ? 2 : 1);
    const windowMs = opts?.windowMs ?? 86_400_000;

    await db
      .insert(linkCooldownChannelsTable)
      .values({ guildId, channelId, mode, maxLinks, windowMs })
      .onConflictDoUpdate({
        target: [
          linkCooldownChannelsTable.guildId,
          linkCooldownChannelsTable.channelId,
        ],
        set: { mode, maxLinks, windowMs, updatedAt: new Date() },
      });

    invalidate(guildId, channelId);
    logger.info(
      `Link cooldown channel added: guild=${guildId} channel=${channelId} mode=${mode} max=${maxLinks} windowMs=${windowMs}`,
    );
    return {
      guildId,
      channelId,
      mode,
      maxLinks,
      windowMs,
      enabled: true,
    };
  }

  static async removeChannel(
    guildId: string,
    channelId: string,
  ): Promise<boolean> {
    const existing = await this.getChannelConfig(guildId, channelId);
    if (!existing) return false;

    await db
      .delete(linkCooldownChannelsTable)
      .where(
        and(
          eq(linkCooldownChannelsTable.guildId, guildId),
          eq(linkCooldownChannelsTable.channelId, channelId),
        ),
      );

    await db
      .delete(linkCooldownEntriesTable)
      .where(
        and(
          eq(linkCooldownEntriesTable.guildId, guildId),
          eq(linkCooldownEntriesTable.channelId, channelId),
        ),
      );

    invalidate(guildId, channelId);
    logger.info(
      `Link cooldown channel removed: guild=${guildId} channel=${channelId}`,
    );
    return true;
  }

  static async setMode(
    guildId: string,
    channelId: string,
    mode: LinkCooldownMode,
  ): Promise<void> {
    const existing = await this.getChannelConfig(guildId, channelId);
    if (!existing) throw new Error("channel_not_configured");

    await db
      .update(linkCooldownChannelsTable)
      .set({ mode, updatedAt: new Date() })
      .where(
        and(
          eq(linkCooldownChannelsTable.guildId, guildId),
          eq(linkCooldownChannelsTable.channelId, channelId),
        ),
      );

    invalidate(guildId, channelId);
  }

  static async setMax(
    guildId: string,
    channelId: string,
    maxLinks: number,
  ): Promise<void> {
    const existing = await this.getChannelConfig(guildId, channelId);
    if (!existing) throw new Error("channel_not_configured");

    await db
      .update(linkCooldownChannelsTable)
      .set({ maxLinks, updatedAt: new Date() })
      .where(
        and(
          eq(linkCooldownChannelsTable.guildId, guildId),
          eq(linkCooldownChannelsTable.channelId, channelId),
        ),
      );

    invalidate(guildId, channelId);
  }

  static async setWindow(
    guildId: string,
    channelId: string,
    windowMs: number,
  ): Promise<void> {
    const existing = await this.getChannelConfig(guildId, channelId);
    if (!existing) throw new Error("channel_not_configured");

    await db
      .update(linkCooldownChannelsTable)
      .set({ windowMs, updatedAt: new Date() })
      .where(
        and(
          eq(linkCooldownChannelsTable.guildId, guildId),
          eq(linkCooldownChannelsTable.channelId, channelId),
        ),
      );

    invalidate(guildId, channelId);
  }

  static async setEnabled(
    guildId: string,
    channelId: string,
    enabled: boolean,
  ): Promise<void> {
    const existing = await this.getChannelConfig(guildId, channelId);
    if (!existing) throw new Error("channel_not_configured");

    await db
      .update(linkCooldownChannelsTable)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(linkCooldownChannelsTable.guildId, guildId),
          eq(linkCooldownChannelsTable.channelId, channelId),
        ),
      );

    invalidate(guildId, channelId);
  }

  static async resetUser(
    guildId: string,
    channelId: string,
    userId: string,
  ): Promise<number> {
    const res = await db
      .delete(linkCooldownEntriesTable)
      .where(
        and(
          eq(linkCooldownEntriesTable.guildId, guildId),
          eq(linkCooldownEntriesTable.channelId, channelId),
          eq(linkCooldownEntriesTable.userId, userId),
        ),
      );
    return (res as unknown as { rowsAffected: number }).rowsAffected ?? 0;
  }

  static async getRecentEntries(
    guildId: string,
    channelId: string,
    limit = 10,
  ): Promise<Array<{ userId: string; url: string; createdAt: Date | null }>> {
    const rows = await db
      .select({
        userId: linkCooldownEntriesTable.userId,
        url: linkCooldownEntriesTable.url,
        createdAt: linkCooldownEntriesTable.createdAt,
      })
      .from(linkCooldownEntriesTable)
      .where(
        and(
          eq(linkCooldownEntriesTable.guildId, guildId),
          eq(linkCooldownEntriesTable.channelId, channelId),
        ),
      )
      .orderBy(desc(linkCooldownEntriesTable.createdAt))
      .limit(limit);
    return rows;
  }

  static async checkAndRecord(
    guildId: string,
    channelId: string,
    userId: string,
    urls: string[],
    messageId: string,
  ): Promise<CheckResult> {
    if (urls.length === 0) {
      return { allowed: true };
    }

    const config = await this.getChannelConfig(guildId, channelId);
    if (!config || !config.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    const cutoff = new Date(now - config.windowMs);

    try {
      await db
        .delete(linkCooldownEntriesTable)
        .where(
          and(
            eq(linkCooldownEntriesTable.guildId, guildId),
            eq(linkCooldownEntriesTable.channelId, channelId),
            eq(linkCooldownEntriesTable.userId, userId),
            sql`${linkCooldownEntriesTable.createdAt} < ${cutoff}`,
          ),
        );
    } catch (e) {
      logger.warn(`Failed lazy purge of link cooldown entries: ${e}`);
    }

    const normalized = urls.map((u) => ({
      raw: u,
      hash: hashUrl(u),
    }));

    if (config.mode === "same") {
      for (const { raw, hash } of normalized) {
        const dup = await db.query.linkCooldownEntriesTable.findFirst({
          where: and(
            eq(linkCooldownEntriesTable.guildId, guildId),
            eq(linkCooldownEntriesTable.channelId, channelId),
            eq(linkCooldownEntriesTable.userId, userId),
            eq(linkCooldownEntriesTable.urlHash, hash),
            gte(linkCooldownEntriesTable.createdAt, cutoff),
          ),
          orderBy: desc(linkCooldownEntriesTable.createdAt),
        });
        if (dup) {
          const createdTs =
            dup.createdAt instanceof Date
              ? dup.createdAt.getTime()
              : Number(dup.createdAt) || now;
          const retryAfterMs = createdTs + config.windowMs - now;
          return {
            allowed: false,
            blockedUrl: raw,
            reason: "same_duplicate",
            retryAfterMs: Math.max(retryAfterMs, 0),
          };
        }
      }
    } else {
      const [row] = await db
        .select({ n: count() })
        .from(linkCooldownEntriesTable)
        .where(
          and(
            eq(linkCooldownEntriesTable.guildId, guildId),
            eq(linkCooldownEntriesTable.channelId, channelId),
            eq(linkCooldownEntriesTable.userId, userId),
            gte(linkCooldownEntriesTable.createdAt, cutoff),
          ),
        );
      const used = Number(row?.n ?? 0);
      if (used >= config.maxLinks) {
        const oldest = await db.query.linkCooldownEntriesTable.findFirst({
          where: and(
            eq(linkCooldownEntriesTable.guildId, guildId),
            eq(linkCooldownEntriesTable.channelId, channelId),
            eq(linkCooldownEntriesTable.userId, userId),
            gte(linkCooldownEntriesTable.createdAt, cutoff),
          ),
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        });
        let oldestTs = now;
        if (oldest?.createdAt) {
          oldestTs =
            oldest.createdAt instanceof Date
              ? oldest.createdAt.getTime()
              : Number(oldest.createdAt) || now;
        }
        const retryAfterMs = oldestTs + config.windowMs - now;
        return {
          allowed: false,
          blockedUrl: urls[0],
          reason: "rate_limit",
          retryAfterMs: Math.max(retryAfterMs, 0),
          recordedCount: used,
        };
      }
    }

    try {
      await db.insert(linkCooldownEntriesTable).values(
        normalized.map((n) => ({
          guildId,
          channelId,
          userId,
          urlHash: n.hash,
          url: n.raw,
          messageId,
        })),
      );
    } catch (e) {
      logger.error("Failed to record link cooldown entries", e);
    }

    return { allowed: true };
  }
}
