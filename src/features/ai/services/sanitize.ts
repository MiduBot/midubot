import { CHATBOT_JOKE_GIFS, CHATBOT_OUTPUT_MAX_CHARS } from "../constants";

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

  const gif = isolateJokeGif(out);
  if (gif) return gif;

  out = out.replace(/@everyone/gi, "@\u200beveryone");
  out = out.replace(/@here/gi, "@\u200bhere");
  out = out.replace(/<@&\d+>/g, "");
  out = out.replace(
    /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi,
    "",
  );
  out = out.replace(/\s{2,}/g, " ").trim();

  if (out.length > CHATBOT_OUTPUT_MAX_CHARS) {
    out = `${out.slice(0, CHATBOT_OUTPUT_MAX_CHARS - 1)}…`;
  }

  return out;
}
