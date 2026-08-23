import type { Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { isIgnored } from "@/core/discord/ignored-channels";
import { extractPuffContent } from "@/features/puff";
import type { ModerationCandidate } from "@/features/ai-moderation/types";
import { logger } from "@/core/logger";

const CANDIDATE_LIMIT = 10;

export interface ReportEvidence {
  reportContent: string;
  selection: "fixed" | "model";
  candidates: ModerationCandidate[];
  messagesByIndex: Map<number, Message>;
}

function emptyEvidence(
  report: Message,
  selection: ReportEvidence["selection"],
): ReportEvidence {
  return {
    reportContent: report.content,
    selection,
    candidates: [],
    messagesByIndex: new Map(),
  };
}

function candidateContent(message: Message): string | null {
  const extracted = extractPuffContent(message);
  if (!extracted) return null;
  if (extracted.kind === "image") return message.content || "(image)";
  return extracted.text?.trim() || null;
}

function toCandidate(message: Message, index: number, content: string): ModerationCandidate {
  return {
    index,
    messageId: message.id,
    authorId: message.author.id,
    channelId: message.channelId,
    content,
    attachments: Array.from(message.attachments.values()).map((attachment) => ({
      url: attachment.url,
      name: attachment.name || attachment.url,
      contentType: attachment.contentType ?? null,
    })),
  };
}

function buildEvidence(
  report: Message,
  selection: ReportEvidence["selection"],
  messages: Message[],
): ReportEvidence {
  const candidates: ModerationCandidate[] = [];
  const messagesByIndex = new Map<number, Message>();
  for (const message of messages) {
    const content = candidateContent(message);
    if (!content) continue;
    const index = candidates.length;
    candidates.push(toCandidate(message, index, content));
    messagesByIndex.set(index, message);
  }
  return {
    reportContent: report.content,
    selection,
    candidates,
    messagesByIndex,
  };
}

export async function collectReportEvidence(report: Message): Promise<ReportEvidence> {
  const guildId = report.guild?.id;
  if (!guildId) return emptyEvidence(report, report.reference?.messageId ? "fixed" : "model");

  const parentId = "parentId" in report.channel
    ? (report.channel.parentId ?? null)
    : null;
  try {
    if (await isIgnored(guildId, { id: report.channelId, parentId })) {
      return emptyEvidence(report, report.reference?.messageId ? "fixed" : "model");
    }
  } catch (error) {
    logger.warn(`ai-mod: failed to check ignored report channel: ${error}`);
    return emptyEvidence(report, report.reference?.messageId ? "fixed" : "model");
  }

  if (report.reference?.messageId) {
    try {
      const referenced = await report.channel.messages.fetch(report.reference.messageId);
      if (referenced.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return emptyEvidence(report, "fixed");
      }
      return buildEvidence(report, "fixed", [referenced]);
    } catch (error) {
      logger.warn(`ai-mod: report reference fetch failed: ${error}`);
      return emptyEvidence(report, "fixed");
    }
  }

  try {
    const fetched = await report.channel.messages.fetch({ limit: CANDIDATE_LIMIT });
    const messages: Message[] = [];
    for (const [, message] of fetched) {
      if (message.id === report.id) continue;
      if (message.author.id === report.author.id) continue;
      if (message.author.bot) continue;
      if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
      messages.push(message);
    }
    return buildEvidence(report, "model", messages.slice(0, CANDIDATE_LIMIT));
  } catch (error) {
    logger.warn(`ai-mod: report candidate fetch failed: ${error}`);
    return emptyEvidence(report, "model");
  }
}
