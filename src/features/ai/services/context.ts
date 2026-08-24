import type { ChatTurn } from "@/features/ai-mod/services/ai-client.service";
import {
  CHATBOT_HISTORY_MAX_CHARS,
  CHATBOT_MESSAGE_MAX_CHARS,
} from "../constants";

export interface HistoryMessage {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  isBot: boolean;
  hasImage: boolean;
  hasAttachment: boolean;
  images?: HistoryImage[];
  attachments?: HistoryAttachment[];
  stickerNames?: string[];
  priority?: boolean;
  current?: boolean;
  direct?: boolean;
  replyToId?: string | null;
  replyToBot?: boolean;
}

export interface HistoryImage {
  url: string;
  mediaType: string;
}

export interface HistoryAttachment {
  name: string;
  mediaType: string | null;
}

function stripWrappers(text: string): string {
  return text.replace(/<\/?message\b[^>]*>/gi, "");
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 80);
}

function attachmentHint(msg: HistoryMessage): string {
  const details = msg.attachments
    ?.slice(0, 4)
    .map((attachment) => {
      const kind = attachment.mediaType?.startsWith("image/")
        ? "imagen"
        : "archivo";
      const mediaType = attachment.mediaType
        ? ` (${attachment.mediaType})`
        : "";
      return `[${kind}: ${attachment.name}${mediaType}]`;
    });
  const stickers = msg.stickerNames
    ?.slice(0, 3)
    .map((name) => `[sticker: ${name}]`);
  const hints = [...(details ?? []), ...(stickers ?? [])];
  if (hints.length > 0) return hints.join(" ");
  if (msg.hasImage) return "[imagen]";
  if (msg.hasAttachment) return "[archivo]";
  return "";
}

function bodyOf(msg: HistoryMessage): string {
  const raw = stripWrappers(msg.content).replace(/\r\n?/g, "\n").trim();
  const hint = attachmentHint(msg);
  const combined = [raw, hint].filter(Boolean).join("\n");
  if (!combined) return "";
  if (combined.length <= CHATBOT_MESSAGE_MAX_CHARS) return combined;
  return `${combined.slice(0, CHATBOT_MESSAGE_MAX_CHARS - 1)}…`;
}

function wrap(msg: HistoryMessage, body: string): string {
  const attrs = [
    `author="${escapeAttr(msg.authorName)}"`,
    `id="${escapeAttr(msg.id)}"`,
    msg.current ? 'current="true"' : "",
    msg.priority ? 'priority="true"' : "",
    msg.direct != null ? `direct="${msg.direct}"` : "",
    msg.replyToId ? `reply_to="${escapeAttr(msg.replyToId)}"` : "",
    msg.replyToBot ? 'reply_to_bot="true"' : "",
  ].filter(Boolean);
  return `<message ${attrs.join(" ")}>${escapeText(body)}</message>`;
}

function toTurn(
  msg: HistoryMessage,
  botId: string,
  includeImages: boolean,
): ChatTurn | null {
  const body = bodyOf(msg);
  if (!body) return null;
  const isAssistant = msg.isBot && msg.authorId === botId;
  if (!isAssistant && includeImages && msg.images?.length) {
    const images = msg.images.slice(0, 2).flatMap((image) => {
      try {
        return [
          {
            type: "image" as const,
            image: new URL(image.url),
            mediaType: image.mediaType,
          },
        ];
      } catch {
        return [];
      }
    });
    if (images.length > 0) {
      return {
        role: "user",
        content: [{ type: "text", text: wrap(msg, body) }, ...images],
      };
    }
  }
  return {
    role: isAssistant ? "assistant" : "user",
    content: isAssistant ? body : wrap(msg, body),
  };
}

function turnLength(turn: ChatTurn): number {
  if (typeof turn.content === "string") return turn.content.length;
  return turn.content.reduce(
    (total, part) => total + (part.type === "text" ? part.text.length : 0),
    0,
  );
}

export function buildChatMessages(
  history: HistoryMessage[],
  botId: string,
  includeImages = false,
): ChatTurn[] {
  const imageMessageId = includeImages
    ? [...history].reverse().find((msg) => msg.priority && msg.images?.length)?.id
    : undefined;
  const candidates = history.flatMap((message, index) => {
    const turn = toTurn(message, botId, message.id === imageMessageId);
    return turn
      ? [{ index, priority: !!message.priority, current: !!message.current, turn }]
      : [];
  });
  if (
    history.some((message) => message.current) &&
    !candidates.some((candidate) => candidate.current)
  ) {
    return [];
  }
  const newestFirst = [
    ...candidates.filter((candidate) => candidate.priority).reverse(),
    ...candidates.filter((candidate) => !candidate.priority).reverse(),
  ];
  const selected: typeof candidates = [];
  let used = 0;

  for (const candidate of newestFirst) {
    const length = turnLength(candidate.turn);
    if (used + length > CHATBOT_HISTORY_MAX_CHARS) continue;
    used += length;
    selected.push(candidate);
  }

  const selectedIndexes = new Set(selected.map((candidate) => candidate.index));
  const coherent = selected.filter((candidate) => {
    if (candidate.priority || candidate.turn.role !== "assistant") return true;
    const previousUser = candidates
      .slice(0, candidates.indexOf(candidate))
      .reverse()
      .find((item) => item.turn.role === "user");
    return !previousUser || selectedIndexes.has(previousUser.index);
  });
  coherent.sort((a, b) => a.index - b.index);

  const merged: ChatTurn[] = [];
  for (const { priority, turn } of coherent) {
    const last = merged[merged.length - 1];
    if (
      !priority &&
      last &&
      last.role === turn.role &&
      typeof last.content === "string" &&
      typeof turn.content === "string"
    ) {
      last.content = `${last.content}\n${turn.content}`;
    } else {
      merged.push(turn);
    }
  }

  return merged;
}

/** Prepend a referenced message if it is not already in `history`. */
export function mergeReferenced(
  history: HistoryMessage[],
  referenced: HistoryMessage | null,
): HistoryMessage[] {
  if (!referenced) return history;
  if (history.some((m) => m.id === referenced.id)) {
    return history.map((message) =>
      message.id === referenced.id
        ? { ...message, priority: true }
        : message,
    );
  }
  return [{ ...referenced, priority: true }, ...history];
}
