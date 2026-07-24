import { Client, ColorResolvable, EmbedBuilder } from "discord.js";

export function buildEmbed({
  color = 0x0099ff,
  title,
  description,
  fields = [],
  footer,
  timestamp = new Date(),
}: {
  color?: ColorResolvable;
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: Date;
}): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(color);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);
  if (footer) embed.setFooter(footer);
  embed.setTimestamp(timestamp);
  return embed;
}

export function parseChannelId(input: string): string | null {
  if (input.startsWith("<#") && input.endsWith(">")) {
    return input.slice(2, -1);
  }
  if(/^\d+$/.test(input)) return input;
  return null;
}

export function parseUserId(input: string): string | null {
  if (input.startsWith("<@!") && input.endsWith(">")) {
    return input.slice(3, -1);
  }
  if (input.startsWith("<@") && input.endsWith(">")) {
    return input.slice(2, -1);
  }
  if(/^\d+$/.test(input)) return input;
  return null;
}

export function parseRoleId(input: string): string | null {
  if (input.startsWith("<@&") && input.endsWith(">")) {
    return input.slice(3, -1);
  }
  if(/^\d+$/.test(input)) return input;
  return null;
}

/**
 * Resuelve un identificador de usuario a un nombre mostrable.
 * Prioriza el nombre global (display name), luego username, y finalmente el ID.
 * Las menciones no se renderizan en títulos de embed, por eso conviene usar el nombre.
 */
export async function resolveDisplayName(
  client: Client,
  userId: string,
): Promise<string> {
  try {
    const user = await client.users.fetch(userId);
    return user.globalName ?? user.username ?? userId;
  } catch {
    return userId;
  }
}
