import type { Guild, Message } from "discord.js";
import { ChannelType } from "discord.js";
import { extractPuffContent } from "@/features/puff";
import { ImageHashService } from "@/features/images";
import { isIgnored } from "@/core/discord/ignored-channels";
import { extractImageUrls } from "@/core/discord/moderation";
import { logger } from "@/core/logger";

const SCAN_MESSAGES_PER_CHANNEL = 50;
const MAX_MATCHES = 100;

export interface ImageDuplicateResult {
  flagged: boolean;
  reason: string;
  matchedMessages: Message[];
}

async function candidateImageUrls(message: Message): Promise<string[]> {
  const content = extractPuffContent(message);
  if (!content || content.kind !== "image" || !content.imageUrls) return [];
  return content.imageUrls;
}

async function collectTextChannels(guild: Guild): Promise<Message["channel"][]> {
  const channels: Message["channel"][] = [];
  try {
    const fetched = await guild.channels.fetch();
    for (const [, channel] of fetched) {
      if (
        channel &&
        (channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement) &&
        channel.viewable &&
        !(await isIgnored(guild.id, { id: channel.id, parentId: channel.parentId ?? null }))
      ) {
        channels.push(channel as unknown as Message["channel"]);
      }
    }
  } catch (e) {
    logger.warn(`image-duplicate: failed to list channels: ${e}`);
  }
  return channels;
}

export class ImageDuplicateService {
  /**
   * Scans non-ignored channels for messages whose image dhash matches the
   * candidate's. Flags malicious when the SAME author has ≥ 2 such messages
   * (the candidate counts as one). No side effects.
   */
  static async checkImage(
    guild: Guild,
    candidate: Message,
  ): Promise<ImageDuplicateResult> {
    const urls = await candidateImageUrls(candidate);
    if (urls.length === 0) {
      return { flagged: false, reason: "", matchedMessages: [] };
    }

    const targetDhashes = new Set<string>();
    for (const url of urls) {
      try {
        const fp = await ImageHashService.downloadFingerprint(url);
        if (fp) targetDhashes.add(fp.dhash);
      } catch {
        // ignore
      }
    }
    if (targetDhashes.size === 0) {
      return { flagged: false, reason: "", matchedMessages: [] };
    }

    const candidateAuthorId = candidate.author.id;
    const matched: Message[] = [];
    let sameAuthorHits = 1; // the candidate itself

    const channels = await collectTextChannels(guild);
    for (const channel of channels) {
      if (matched.length >= MAX_MATCHES) break;
      try {
        const fetched = await (channel as { messages: { fetch: (o: unknown) => Promise<Map<string, Message>> } }).messages.fetch({
          limit: SCAN_MESSAGES_PER_CHANNEL,
        });
        for (const [, msg] of fetched) {
          if (matched.length >= MAX_MATCHES) break;
          if (msg.id === candidate.id) continue;
          const msgUrls: string[] = [];
          for (const att of msg.attachments.values()) {
            if (att.contentType?.startsWith("image/")) msgUrls.push(att.url);
          }
          msgUrls.push(...extractImageUrls(msg.content));
          for (const url of msgUrls) {
            try {
              const fp = await ImageHashService.downloadFingerprint(url);
              if (fp && targetDhashes.has(fp.dhash)) {
                if (msg.author.id === candidateAuthorId) {
                  sameAuthorHits++;
                  if (matched.length < MAX_MATCHES) matched.push(msg);
                }
                break;
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (e) {
        logger.warn(`image-duplicate: failed to scan channel: ${e}`);
      }
    }

    if (sameAuthorHits >= 2) {
      return { flagged: true, reason: "imagen spam cross-channel", matchedMessages: matched };
    }
    return { flagged: false, reason: "", matchedMessages: [] };
  }
}
