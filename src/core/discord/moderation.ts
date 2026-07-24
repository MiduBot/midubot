import { Message, GuildMember } from "discord.js";
import { logger } from "@/core/logger";

export async function safeDelete(
  message: Message,
  _reason?: string,
): Promise<boolean> {
  try {
    if (message.deletable) {
      await message.delete();
      return true;
    }
  } catch (error) {
    logger.warn(`Failed to delete message ${message.id}: ${error}`);
  }
  return false;
}

export async function safeTimeout(
  member: GuildMember,
  durationMs: number,
  reason?: string,
): Promise<boolean> {
  try {
    if (member.moderatable) {
      await member.timeout(durationMs, reason);
      return true;
    }
  } catch (error) {
    logger.warn(`Failed to timeout member ${member.id}: ${error}`);
  }
  return false;
}

export function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

export function containsImageUrl(content: string): boolean {
  const imageUrlPattern =
    /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:[?#][^\s]*)?/gi;
  return imageUrlPattern.test(content);
}

export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  const urlPattern =
    /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:[?#][^\s]*)?/gi;
  const matches = content.match(urlPattern);

  if (!matches) return urls;

  for (const match of matches) {
    let url = match.replace(/\.$/, "").trim();
    if (url.endsWith(")")) {
      url = url.slice(0, -1);
    }
    if (url) urls.push(url);
  }

  return urls;
}
