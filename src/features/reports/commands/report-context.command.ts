import { MessageContextMenuCommandInteraction } from "discord.js";
import {
  addReport,
} from "@/features/reports/services/report.service";
import { handleReportQuorum } from "@/features/reports";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

export async function handleReportContextMenu(
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const target = interaction.targetMessage;
  const reporterId = interaction.user.id;
  const lang = await LanguageService.getLanguage(guild.id);
  const t = getTranslation(lang);

  if (target.author.id === reporterId) {
    await interaction.reply({ content: t.report.self_report, ephemeral: true });
    return;
  }

  if (target.author.bot) {
    await interaction.reply({ content: t.report.bot_report, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const result = addReport(target.id, reporterId, target);

  if (result.kind === "already_processed") {
    await interaction.editReply({ content: t.report.already_processed });
    return;
  }

  if (result.kind === "self_report") {
    await interaction.editReply({ content: t.report.self_report });
    return;
  }

  if (result.kind === "already_reported") {
    await interaction.editReply({ content: t.report.already_reported });
    return;
  }

  if (!result.isQuorum) {
    await interaction.editReply({
      content: t.report.report_added.replace("{count}", String(result.count)),
    });
    return;
  }

  await handleReportQuorum(target, guild);
  await interaction.editReply({ content: t.report.quorum_reached });
}
