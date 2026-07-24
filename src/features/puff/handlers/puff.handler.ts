import {
  ChannelType,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel,
} from "discord.js";
import {
  ImageService,
  ImageHashService,
  getOrComputeFingerprint,
} from "@/features/images";
import {
  extractImageUrls,
  normalizeText,
  safeDelete,
  safeTimeout,
} from "@/core/discord/moderation";
import { isIgnored } from "@/core/discord/ignored-channels";
import { logger } from "@/core/logger";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_REASON = "Puff: 24h timeout via context menu";

const SCAN_MESSAGES_PER_CHANNEL = 50;
const SCAN_CHANNEL_DELAY_MS = 0;
const SCAN_MESSAGE_DELAY_MS = 0;

export type PuffResult =
  | { kind: "no_permission" }
  | { kind: "bot_author" }
  | { kind: "no_content" }
  | {
      kind: "success";
      contentKind: "image" | "text";
      addedImages: number;
      deletedMessages: number;
      scannedChannels: number;
      timedOutAuthors: number;
      totalOffenders: number;
    };

export interface PuffContent {
  kind: "image" | "text";
  imageUrls?: string[];
  text?: string;
}

export function extractPuffContent(message: Message): PuffContent | null {
  const imageUrls: string[] = [];
  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith("image/")) {
      imageUrls.push(attachment.url);
    }
  }
  imageUrls.push(...extractImageUrls(message.content));

  if (imageUrls.length > 0) {
    return { kind: "image", imageUrls };
  }

  if (normalizeText(message.content).length > 0) {
    return { kind: "text", text: message.content };
  }

  return null;
}

async function persistImage(
  guildId: string,
  messageId: string,
  imageUrls: string[],
): Promise<{ addedImages: number; fingerprints: string[] }> {
  let addedImages = 0;
  const fingerprints: string[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    try {
      const fingerprint = await getOrComputeFingerprint(url, () =>
        ImageHashService.downloadFingerprint(url),
      );
      if (!fingerprint) {
        logger.warn(`Puff: could not compute fingerprint for ${url}`);
        continue;
      }
      fingerprints.push(fingerprint.dhash);
      const name = `puff-${messageId}-${i}`;
      try {
        await ImageService.addImage(guildId, name, url);
        addedImages++;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        if (reason.includes("already exists")) continue;
        logger.warn(`Puff: failed to add image ${name}: ${reason}`);
      }
    } catch (e) {
      logger.error(`Puff: error processing image ${url}`, e);
    }
  }

  return { addedImages, fingerprints };
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectTextChannels(guild: Guild): Promise<TextChannel[]> {
  const channels: TextChannel[] = [];
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
        channels.push(channel as TextChannel);
      }
    }
  } catch (e) {
    logger.warn(`Puff: failed to list channels: ${e}`);
  }
  return channels;
}

async function isDuplicate(
  message: Message,
  content: PuffContent,
  targetDhashes: Set<string>,
): Promise<boolean> {
  if (content.kind === "text" && content.text) {
    return message.content === content.text;
  }

  if (content.kind === "image") {
    const urls: string[] = [];
    for (const attachment of message.attachments.values()) {
      if (attachment.contentType?.startsWith("image/")) {
        urls.push(attachment.url);
      }
    }
    urls.push(...extractImageUrls(message.content));

    for (const url of urls) {
      try {
        const fp = await getOrComputeFingerprint(url, () =>
          ImageHashService.downloadFingerprint(url),
        );
        if (fp && targetDhashes.has(fp.dhash)) return true;
      } catch {
        // ignore individual download/hash failures
      }
    }
  }

  return false;
}

async function scanChannelForDuplicates(
  channel: TextChannel,
  content: PuffContent,
  targetDhashes: Set<string>,
  excludeMessageId: string,
): Promise<Message[]> {
  const matches: Message[] = [];
  try {
    const fetched = await channel.messages.fetch({ limit: SCAN_MESSAGES_PER_CHANNEL });
    for (const [, message] of fetched) {
      if (message.id === excludeMessageId) continue;
      if (await isDuplicate(message, content, targetDhashes)) {
        matches.push(message);
      }
    }
  } catch (e) {
    logger.warn(`Puff: failed to scan channel ${channel.id}: ${e}`);
  }
  return matches;
}

export async function handlePuff(
  target: Message,
  executor: GuildMember,
): Promise<PuffResult> {
  if (!executor.permissions.has("ManageMessages")) {
    return { kind: "no_permission" };
  }

  const selfUserId = target.client?.user?.id;
  if (selfUserId && target.author.id === selfUserId) {
    return { kind: "bot_author" };
  }

  const guild = target.guild;
  const guildId = target.guildId ?? guild?.id;
  if (!guild || !guildId) {
    return { kind: "no_content" };
  }

  const content = extractPuffContent(target);
  if (!content) {
    return { kind: "no_content" };
  }

  let addedImages = 0;
  const targetDhashes = new Set<string>();

  if (content.kind === "image" && content.imageUrls) {
    const persisted = await persistImage(guildId, target.id, content.imageUrls);
    addedImages = persisted.addedImages;
    for (const fp of persisted.fingerprints) {
      if (fp) targetDhashes.add(fp);
    }
  }

  const okOriginal = await safeDelete(target);
  let deletedMessages = okOriginal ? 1 : 0;

  const offenders = new Map<string, Message>();
  offenders.set(target.author.id, target);

  const channels = await collectTextChannels(guild);
  let scannedChannels = 0;

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    if (i > 0) await sleep(SCAN_CHANNEL_DELAY_MS);
    scannedChannels++;

    const matches = await scanChannelForDuplicates(
      channel,
      content,
      targetDhashes,
      target.id,
    );

    for (const message of matches) {
      offenders.set(message.author.id, message);
      await sleep(SCAN_MESSAGE_DELAY_MS);
      const ok = await safeDelete(message);
      if (ok) deletedMessages++;
    }
  }

  const timedOutAuthors: string[] = [];
  for (const [authorId, sample] of offenders) {
    try {
      const member = await guild.members.fetch(authorId);
      if (!member) {
        logger.warn(`Puff: could not resolve member ${authorId} for timeout`);
        continue;
      }
      const ok = await safeTimeout(member, ONE_DAY_MS, TIMEOUT_REASON);
      if (ok) timedOutAuthors.push(authorId);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      logger.error(
        `Puff: timeout failed for ${authorId} (channel ${sample.channelId}): ${reason}`,
      );
    }
  }

  return {
    kind: "success",
    contentKind: content.kind,
    addedImages,
    deletedMessages,
    scannedChannels,
    timedOutAuthors: timedOutAuthors.length,
    totalOffenders: offenders.size,
  };
}
