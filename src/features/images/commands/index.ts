import { Message } from "discord.js";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";
import { handleAddImage } from "./add";
import { handleListImages } from "./list";
import { handleRemoveImage } from "./remove";
import { handleCheckImage } from "./check";
import { handleMigrateImages } from "./migrate";

export async function handleImagesCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  if (args.length < 1) {
    await message.reply(t.images.usage_add + "\n" + t.images.usage_rm);
    return;
  }

  const subcommand = args[0].toLowerCase();

  try {
    if (
      subcommand === "add" ||
      subcommand === "a" ||
      subcommand === "+" ||
      subcommand === "create"
    ) {
      await handleAddImage(message, guildId, args, t);
    } else if (
      subcommand === "list" ||
      subcommand === "ls" ||
      subcommand === "l" ||
      subcommand === "ver"
    ) {
      await handleListImages(message, guildId, t);
    } else if (
      subcommand === "remove" ||
      subcommand === "rm" ||
      subcommand === "del" ||
      subcommand === "delete" ||
      subcommand === "borrar"
    ) {
      await handleRemoveImage(message, guildId, args, t);
    } else if (
      subcommand === "check" ||
      subcommand === "verify" ||
      subcommand === "test"
    ) {
      await handleCheckImage(message, guildId, args, t);
    } else if (
      subcommand === "migrate" ||
      subcommand === "upgrade" ||
      subcommand === "migrar" ||
      subcommand === "reindex"
    ) {
      await handleMigrateImages(message, guildId, t);
    } else {
      await message.reply(t.commands.unknown.replace("{prefix}", prefix));
    }
  } catch (error) {
    logger.error("Error handling images command", error);
    await message.reply(t.commands.error);
  }
}
