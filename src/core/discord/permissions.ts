import { Message, PermissionsString, Snowflake } from "discord.js";
import { WhitelistService } from "@/features/whitelist";
import { isSuperdev } from "@/config/env";

export async function hasPermission(message: Message): Promise<boolean> {
  const member = message.member;
  if (!member) return false;

  if (isSuperdev(message.author.id)) return true;

  if (member.permissions.has("ManageMessages")) return true;

  const guildId = message.guild?.id;
  if (!guildId) return false;

  const list = await WhitelistService.getWhitelist(guildId);
  for (const w of list) {
    if (w.type === "member" && w.entityId === member.id) return true;
    if (w.type === "role" && member.roles.cache.has(w.entityId as Snowflake))
      return true;
    if (
      w.type === "permission" &&
      member.permissions.has(w.entityId as PermissionsString)
    )
      return true;
  }

  return false;
}

export function requireManageMessages(
  message: Message,
): Promise<boolean> | boolean {
  return hasPermission(message);
}
