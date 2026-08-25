import {
  CHATBOT_JOKE_GIFS,
  CHATBOT_NO_REPLY,
} from "../constants";
import { chunkForDiscord } from "@/core/discord/formatters";

export function isChatbotNoReply(text: string): boolean {
  return text.includes(CHATBOT_NO_REPLY);
}

export function isolateJokeGif(
  text: string,
  gifs: Readonly<Record<string, string>> = CHATBOT_JOKE_GIFS,
): string | null {
  for (const url of Object.values(gifs)) {
    if (url && text.includes(url)) return url;
  }
  return null;
}

export function sanitizeChatbotOutput(text: string): string {
  let out = text.trim();
  if (!out) return "";
  if (isChatbotNoReply(out)) return "";

  const gif = isolateJokeGif(out);
  if (gif) return gif;

  out = out.replace(/@everyone/gi, "@\u200beveryone");
  out = out.replace(/@here/gi, "@\u200bhere");
  out = out.replace(/<@&\d+>/g, "");
  out = out.replace(
    /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi,
    "",
  );
  return out.trim();
}

export function splitChatbotOutput(text: string): string[] {
  let openFence: string | null = null;
  return chunkForDiscord(text).map((chunk) => {
    const prefix = openFence ? `${openFence}\n` : "";
    for (const match of chunk.matchAll(/```[^\n]{0,40}/g)) {
      openFence = openFence ? null : match[0];
    }
    return `${prefix}${chunk}${openFence ? "\n```" : ""}`;
  });
}
