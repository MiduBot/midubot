import { MessageContextMenuCommandInteraction } from "discord.js";
import { handlePuff, type PuffResult } from "../handlers/puff.handler";
import { ModActionService } from "@/features/mod-actions";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { isSuperdev } from "@/config/env";

export async function handlePuffContextMenu(
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const lang = await LanguageService.getLanguage(guild.id);
  const t = getTranslation(lang);

  let member;
  try {
    member = await guild.members.fetch(interaction.user.id);
  } catch {
    await interaction.reply({ content: t.puff.no_permission, ephemeral: true });
    return;
  }

  if (!isSuperdev(interaction.user.id) && !member.permissions.has("ManageMessages")) {
    await interaction.reply({ content: t.puff.no_permission, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const result: PuffResult = await handlePuff(interaction.targetMessage, member);

  switch (result.kind) {
    case "no_permission":
      await interaction.editReply({ content: t.puff.no_permission });
      return;
    case "bot_author":
      await interaction.editReply({ content: t.puff.bot_author });
      return;
    case "no_content":
      await interaction.editReply({ content: t.puff.no_content });
      return;
    case "success": {
      ModActionService.logAction(
        guild.id,
        "puff",
        interaction.targetMessage.author.id,
        interaction.user.id,
        "Puff context menu",
        {
          contentKind: result.contentKind,
          deletedMessages: result.deletedMessages,
          timedOutAuthors: result.timedOutAuthors,
          totalOffenders: result.totalOffenders,
          scannedChannels: result.scannedChannels,
        },
      );
      const replacements = {
        "{added}": String(result.addedImages),
        "{deleted}": String(result.deletedMessages),
        "{scanned}": String(result.scannedChannels),
        "{timedOut}": String(result.timedOutAuthors),
        "{offenders}": String(result.totalOffenders),
      };
      const template =
        result.contentKind === "image" ? t.puff.summary_image : t.puff.summary_text;
      const content = template.replace(
        /\{(\w+)\}/g,
        (m) => (replacements as Record<string, string>)[m] ?? m,
      );
      await interaction.editReply({ content });
      return;
    }
  }
}
