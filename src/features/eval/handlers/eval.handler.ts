import type { Message, SendableChannels } from "discord.js";
import { inspect } from "node:util";
import { safeDelete } from "@/core/discord/moderation";
import { isSuperdev } from "@/config/env";

export function extractCode(content: string, prefix: string): string {
  const withoutPrefix = content.slice(prefix.length);
  const withoutCommand = withoutPrefix.replace(/^\S+\s*/, "");
  const fenced = withoutCommand.match(/^```(?:\w+)?\n?([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : withoutCommand).trim();
}

const MIN_REDACTABLE_LENGTH = 6;

export function redactSecrets(text: string): string {
  let result = text;
  for (const value of Object.values(process.env)) {
    if (!value || value.length < MIN_REDACTABLE_LENGTH) continue;
    result = result.split(value).join("[REDACTED]");
  }
  return result;
}

const DEFAULT_CHUNK_SIZE = 1900;

export function chunkForDiscord(
  text: string,
  size = DEFAULT_CHUNK_SIZE,
): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export function wrapCodeBlock(text: string): string {
  return "```js\n" + text + "\n```";
}

async function runEval(code: string, message: Message): Promise<unknown> {
  const client = message.client;
  try {
    const asExpr = `(async (message, client) => {\nreturn (${code});\n})`;
    // eslint-disable-next-line no-eval
    return await (0, eval)(asExpr)(message, client);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const asStatements = `(async (message, client) => {\n${code}\n})`;
    // eslint-disable-next-line no-eval
    return await (0, eval)(asStatements)(message, client);
  }
}

export async function handleEvalCommand(
  message: Message,
  _args: string[],
  prefix: string,
): Promise<void> {
  if (!isSuperdev(message.author.id)) return;

  const code = extractCode(message.content, prefix);
  if (!code) return;

  let output: string;
  try {
    const result = await runEval(code, message);
    output = inspect(result, { depth: 1 });
  } catch (error) {
    output = inspect(error, { depth: 1 });
  }

  output = redactSecrets(output);
  const chunks = chunkForDiscord(output);

  await message.reply(wrapCodeBlock(chunks[0]));
  const channel = message.channel as SendableChannels;
  for (const chunk of chunks.slice(1)) {
    await channel.send(wrapCodeBlock(chunk));
  }

  await safeDelete(message);
}
