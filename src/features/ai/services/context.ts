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
}

function stripWrappers(text: string): string {
  return text.replace(/<\/?message\b[^>]*>/gi, "");
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
  if (msg.hasImage) return "[imagen]";
  if (msg.hasAttachment) return "[archivo]";
  return "";
}

function bodyOf(msg: HistoryMessage): string {
  const raw = stripWrappers(msg.content).replace(/\s+/g, " ").trim();
  const hint = attachmentHint(msg);
  const combined = [raw, hint].filter(Boolean).join(" ");
  if (!combined) return "";
  if (combined.length <= CHATBOT_MESSAGE_MAX_CHARS) return combined;
  return `${combined.slice(0, CHATBOT_MESSAGE_MAX_CHARS - 1)}…`;
}

function wrap(msg: HistoryMessage, body: string): string {
  return `<message author="${escapeAttr(msg.authorName)}" id="${escapeAttr(msg.id)}">${body}</message>`;
}

function toTurn(msg: HistoryMessage, botId: string): ChatTurn | null {
  const body = bodyOf(msg);
  if (!body) return null;
  const isAssistant = msg.isBot && msg.authorId === botId;
  return {
    role: isAssistant ? "assistant" : "user",
    content: isAssistant ? body : wrap(msg, body),
  };
}

export function buildChatMessages(
  history: HistoryMessage[],
  botId: string,
): ChatTurn[] {
  const selected: ChatTurn[] = [];
  let used = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const turn = toTurn(history[i], botId);
    if (!turn) continue;
    if (used + turn.content.length > CHATBOT_HISTORY_MAX_CHARS) continue;
    used += turn.content.length;
    selected.push(turn);
  }

  selected.reverse();

  const merged: ChatTurn[] = [];
  for (const turn of selected) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n${turn.content}`;
    } else {
      merged.push({ ...turn });
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
  if (history.some((m) => m.id === referenced.id)) return history;
  return [referenced, ...history];
}
