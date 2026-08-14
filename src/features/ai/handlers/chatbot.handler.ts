import type { Message } from "discord.js";
import { env } from "@/config/env";
import { logger } from "@/core/logger";
import { isIgnored } from "@/core/discord/ignored-channels";
import { AIClientService } from "@/features/ai-mod";
import { ModRoleService } from "@/features/ai-mod/services/mod-role.service";
import {
  CHATBOT_CONTEXT_MESSAGES,
  CHATBOT_MENTION_PENDING_MAX,
  CHATBOT_PENDING_MAX,
  CHATBOT_SILENCE_MS,
  CHATBOT_STICKY_MS,
  CHATBOT_SYSTEM_PROMPT,
  CHATBOT_TEMPERATURE,
  CHATBOT_TIMEOUT_MS,
} from "../constants";
import { AiChatConfigService } from "../services/ai-chat-config.service";
import {
  buildChatMessages,
  mergeReferenced,
  type HistoryMessage,
} from "../services/context";
import { sanitizeChatbotOutput } from "../services/sanitize";

export interface ShouldRespondInput {
  enabled: boolean;
  isAiChannel: boolean;
  mentionedBot: boolean;
  replyToBot: boolean;
  mentionsModRole: boolean;
  ignored: boolean;
  lastHumanMessageAt: number | null;
  lastBotReplyAt: number | null;
  lastBotReplyUserId: string | null;
  authorId: string;
  now: number;
}

export function shouldRespond(input: ShouldRespondInput): boolean {
  if (!input.enabled) return false;
  if (input.mentionsModRole) return false;

  if (input.mentionedBot || input.replyToBot) return true;
  if (input.ignored && !input.isAiChannel) return false;
  if (!input.isAiChannel) return false;

  if (
    input.lastBotReplyAt != null &&
    input.lastBotReplyUserId === input.authorId &&
    input.now - input.lastBotReplyAt < CHATBOT_STICKY_MS
  ) {
    return true;
  }

  if (
    input.lastHumanMessageAt == null ||
    input.now - input.lastHumanMessageAt >= CHATBOT_SILENCE_MS
  ) {
    return true;
  }

  return false;
}

interface BotReplyMemory {
  userId: string;
  at: number;
}

interface PendingTurn {
  message: Message;
  botId: string;
  priority: boolean;
}

const lastHumanAt = new Map<string, number>();
const lastBotReply = new Map<string, BotReplyMemory>();
const inflight = new Set<string>();
const pending = new Map<string, PendingTurn[]>();

export function resetChatbotMemory(): void {
  lastHumanAt.clear();
  lastBotReply.clear();
  inflight.clear();
  pending.clear();
}

function enqueuePending(turn: PendingTurn): void {
  const channelId = turn.message.channelId;
  const q = pending.get(channelId) ?? [];
  if (q.some((t) => t.message.id === turn.message.id)) return;
  q.push(turn);

  while (q.length > CHATBOT_PENDING_MAX) {
    const dropIdx = q.findIndex((t) => !t.priority);
    if (dropIdx !== -1) {
      const [dropped] = q.splice(dropIdx, 1);
      logger.warn(
        `chatbot: dropping queued message ${dropped.message.id} in ${channelId} (cap ${CHATBOT_PENDING_MAX})`,
      );
      continue;
    }
    if (q.length > CHATBOT_MENTION_PENDING_MAX) {
      const dropped = q.shift();
      logger.warn(
        `chatbot: dropping queued mention ${dropped?.message.id} in ${channelId} (mention cap ${CHATBOT_MENTION_PENDING_MAX})`,
      );
      continue;
    }
    break;
  }

  pending.set(channelId, q);
}

function dequeuePending(channelId: string): PendingTurn | undefined {
  const q = pending.get(channelId);
  if (!q?.length) return undefined;
  const next = q.shift();
  if (!q.length) pending.delete(channelId);
  return next;
}

function displayName(message: Message): string {
  return (
    message.member?.displayName ??
    message.author.globalName ??
    message.author.username ??
    message.author.id
  );
}

function hasImageAttachment(message: Message): boolean {
  return [...message.attachments.values()].some((a) =>
    (a.contentType ?? "").startsWith("image/"),
  );
}

function toHistory(message: Message): HistoryMessage {
  return {
    id: message.id,
    content: message.content ?? "",
    authorId: message.author.id,
    authorName: displayName(message),
    isBot: message.author.bot,
    hasImage: hasImageAttachment(message),
    hasAttachment: message.attachments.size > 0,
  };
}

function parentIdOf(message: Message): string | null {
  const channel = message.channel;
  if (channel && "parentId" in channel) {
    return (channel.parentId as string | null) ?? null;
  }
  return null;
}

async function mentionsConfiguredModRole(
  guildId: string,
  message: Message,
): Promise<boolean> {
  const roles = message.mentions?.roles;
  if (!roles || roles.size === 0) return false;
  const ids = [...roles.keys()];
  const flags = await Promise.all(
    ids.map((rid) => ModRoleService.hasRole(guildId, rid)),
  );
  return flags.some(Boolean);
}

async function previousHumanTimestamp(
  message: Message,
  botId: string,
): Promise<number | null> {
  const cached = lastHumanAt.get(message.channelId);
  if (cached !== undefined) return cached;

  const channel = message.channel;
  if (!channel || !("messages" in channel) || !channel.messages?.fetch) {
    return null;
  }

  try {
    const fetched = await channel.messages.fetch({
      limit: CHATBOT_CONTEXT_MESSAGES,
    });
    const previous = [...fetched.values()]
      .filter(
        (m) =>
          m.id !== message.id && !m.author.bot && m.author.id !== botId,
      )
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
    return previous?.createdTimestamp ?? null;
  } catch (error) {
    logger.warn(`chatbot: failed to fetch previous messages: ${error}`);
    return null;
  }
}

async function loadHistory(message: Message): Promise<HistoryMessage[]> {
  const channel = message.channel;
  let history: HistoryMessage[] = [toHistory(message)];

  if (channel && "messages" in channel && channel.messages?.fetch) {
    try {
      const fetched = await channel.messages.fetch({
        limit: CHATBOT_CONTEXT_MESSAGES,
      });
      const items = [...fetched.values()].sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp,
      );
      history = items.map(toHistory);
      if (!history.some((m) => m.id === message.id)) {
        history.push(toHistory(message));
      }
    } catch (error) {
      logger.warn(`chatbot: failed to fetch history: ${error}`);
    }
  }

  let referenced: HistoryMessage | null = null;
  if (message.reference?.messageId) {
    try {
      const ref =
        "fetchReference" in message && typeof message.fetchReference === "function"
          ? await message.fetchReference()
          : await channel.messages.fetch(message.reference.messageId);
      if (ref && "author" in ref) referenced = toHistory(ref as Message);
    } catch {
      // referenced message gone
    }
  }

  return mergeReferenced(history, referenced);
}

async function replyTo(message: Message, botId: string): Promise<void> {
  const history = await loadHistory(message);
  const turns = buildChatMessages(history, botId);
  if (turns.length === 0) return;

  if (
    "sendTyping" in message.channel &&
    typeof message.channel.sendTyping === "function"
  ) {
    void message.channel.sendTyping();
  }

  const raw = await AIClientService.chatMessages(
    CHATBOT_SYSTEM_PROMPT,
    turns,
    { temperature: CHATBOT_TEMPERATURE, timeoutMs: CHATBOT_TIMEOUT_MS },
  );
  const content = raw ? sanitizeChatbotOutput(raw) : "";
  if (!content) return;

  await message.reply({
    content,
    allowedMentions: { parse: [], repliedUser: true },
  });

  lastBotReply.set(message.channelId, {
    userId: message.author.id,
    at: Date.now(),
  });
}

async function drainChannel(channelId: string, first: PendingTurn): Promise<void> {
  if (inflight.has(channelId)) {
    enqueuePending(first);
    return;
  }

  inflight.add(channelId);
  try {
    let current: PendingTurn | undefined = first;
    while (current) {
      try {
        await replyTo(current.message, current.botId);
      } catch (error) {
        logger.error("Error in chatbot reply", error);
      }
      current = dequeuePending(channelId);
    }
  } finally {
    inflight.delete(channelId);
    const leftover = dequeuePending(channelId);
    if (leftover) void drainChannel(channelId, leftover);
  }
}

export async function handleChatbot(message: Message): Promise<void> {
  try {
    if (message.author.bot) return;
    const guildId = message.guild?.id;
    if (!guildId) return;
    if (!env.AI_API_URL || !env.AI_API_KEY) return;

    const config = await AiChatConfigService.getConfig(guildId);
    const now = message.createdTimestamp ?? Date.now();
    const isAiChannel = config.channelId === message.channelId;
    if (!config.enabled) {
      if (isAiChannel) lastHumanAt.set(message.channelId, now);
      return;
    }

    const botId = message.client?.user?.id;
    if (!botId) return;

    const mentionedBot = !!message.mentions?.users?.has(botId);
    let replyToBot = message.mentions?.repliedUser?.id === botId;
    if (!replyToBot && message.reference?.messageId) {
      try {
        const ref =
          "fetchReference" in message &&
          typeof message.fetchReference === "function"
            ? await message.fetchReference()
            : null;
        if (ref?.author?.id === botId) replyToBot = true;
      } catch {
        // referenced message gone
      }
    }
    const mentionsModRole = await mentionsConfiguredModRole(guildId, message);

    let ignored = false;
    if (!isAiChannel) {
      ignored = await isIgnored(guildId, {
        id: message.channelId,
        parentId: parentIdOf(message),
      });
    }

    const lastHumanMessageAt = isAiChannel
      ? await previousHumanTimestamp(message, botId)
      : null;
    if (isAiChannel) {
      lastHumanAt.set(message.channelId, now);
    }
    const sticky = lastBotReply.get(message.channelId);

    const respond = shouldRespond({
      enabled: true,
      isAiChannel,
      mentionedBot,
      replyToBot,
      mentionsModRole,
      ignored,
      lastHumanMessageAt,
      lastBotReplyAt: sticky?.at ?? null,
      lastBotReplyUserId: sticky?.userId ?? null,
      authorId: message.author.id,
      now,
    });

    if (!respond) return;

    await drainChannel(message.channelId, {
      message,
      botId,
      priority: mentionedBot || replyToBot,
    });
  } catch (error) {
    logger.error("Error in handleChatbot", error);
  }
}
