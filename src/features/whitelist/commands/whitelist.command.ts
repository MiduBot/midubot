import { Message, StringSelectMenuBuilder, ActionRowBuilder } from "discord.js";
import {
  WhitelistService,
  type WhitelistType,
} from "../services/whitelist.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

const PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "ManageMessages",
  "ManageWebhooks",
  "ManageThreads",
  "KickMembers",
  "BanMembers",
  "MuteMembers",
  "MoveMembers",
];

export async function handleWhitelistCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usageMsg = t.whitelist.usage.replace("{prefix}", prefix);

  if (args.length < 1) {
    await message.reply(usageMsg);
    return;
  }

  const subcommand = args[0].toLowerCase();

  try {
    if (subcommand === "list" || subcommand === "ls" || subcommand === "l") {
      await handleList(message, guildId, t);
    } else if (
      subcommand === "add" ||
      subcommand === "a" ||
      subcommand === "+"
    ) {
      await handleAdd(message, guildId, args, t, usageMsg);
    } else if (
      subcommand === "remove" ||
      subcommand === "rm" ||
      subcommand === "del" ||
      subcommand === "delete"
    ) {
      await handleRemove(message, guildId, args, t, usageMsg);
    } else {
      await message.reply(usageMsg);
    }
  } catch (error) {
    logger.error("Error handling whitelist command", error);
    await message.reply(t.commands.error);
  }
}

async function handleList(
  message: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  try {
    const list = await WhitelistService.getWhitelist(guildId);

    if (list.length === 0) {
      await message.reply(t.whitelist.no_entries);
      return;
    }

    const embed = {
      color: 0x0099ff,
      title: t.whitelist.list_title,
      description: list
        .map((w) => {
          if (w.type === "role")
            return `• Role: <@&${w.entityId}> (${w.entityId})`;
          if (w.type === "member")
            return `• Member: <@${w.entityId}> (${w.entityId})`;
          return `• Permission: \`${w.entityId}\``;
        })
        .join("\n"),
    };

    await message.reply({ embeds: [embed] });
  } catch (error) {
    logger.error("Error listing whitelist", error);
    await message.reply(t.commands.error);
  }
}

async function handleAdd(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  usageMsg: string,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(usageMsg);
    return;
  }

  let type: WhitelistType = "permission";
  let entityId = args[1];

  if (entityId.startsWith("<@&") && entityId.endsWith(">")) {
    type = "role";
    entityId = entityId.slice(3, -1);
  } else if (entityId.startsWith("<@!") && entityId.endsWith(">")) {
    type = "member";
    entityId = entityId.slice(3, -1);
  } else if (entityId.startsWith("<@") && entityId.endsWith(">")) {
    type = "member";
    entityId = entityId.slice(2, -1);
  } else if (/^\d+$/.test(entityId)) {
    if (message.guild?.roles.cache.has(entityId)) type = "role";
    else type = "member";
  } else if (entityId.toLowerCase() === "permission") {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("whitelist_permission_select")
      .setPlaceholder(t.whitelist.permissions_placeholder)
      .addOptions(
        PERMISSIONS.map((perm) => ({
          label: perm,
          value: perm,
        })),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    await message.reply({
      content: t.whitelist.permissions_list,
      components: [row],
    });
    return;
  }

  try {
    await WhitelistService.addWhitelist(guildId, type, entityId);
    await message.reply(t.whitelist.added);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(t.whitelist.add_error.replace("{msg}", msg));
  }
}

async function handleRemove(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  usageMsg: string,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(usageMsg);
    return;
  }

  let entityId = args[1];

  if (entityId.startsWith("<@&") && entityId.endsWith(">")) {
    entityId = entityId.slice(3, -1);
  } else if (entityId.startsWith("<@!") && entityId.endsWith(">")) {
    entityId = entityId.slice(3, -1);
  } else if (entityId.startsWith("<@") && entityId.endsWith(">")) {
    entityId = entityId.slice(2, -1);
  }

  try {
    await WhitelistService.removeWhitelist(guildId, entityId);
    await message.reply(t.whitelist.removed);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(t.whitelist.rm_error.replace("{msg}", msg));
  }
}
