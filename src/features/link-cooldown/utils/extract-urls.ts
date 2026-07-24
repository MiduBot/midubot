import type { Message } from "discord.js";

const URL_RE = /https?:\/\/[^\s<>()"]+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}]+$/;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    let u = m.replace(TRAILING_PUNCT, "");
    if (u) out.push(u);
  }
  return out;
}

export function extractUrlsFromMessage(message: Message): string[] {
  const found = new Set<string>();
  const push = (s: string | null | undefined) => {
    if (!s) return;
    for (const u of extractUrls(s)) found.add(u);
  };

  push(message.content);

  for (const embed of message.embeds) {
    push(embed.url);
    push(embed.title);
    push(embed.description);
    push(embed.footer?.text ?? null);
    push(embed.author?.url ?? null);
    for (const f of embed.fields) {
      push(f.name);
      push(f.value);
    }
  }

  return Array.from(found);
}
