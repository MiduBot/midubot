import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { ModerationReviewService } from "../services/review.service";
import { ModerationRunsService } from "../services/runs.service";
import { canReviewModeration } from "../services/review-permissions.service";

const REVIEW_BUTTON = /^modreview_(\d+)_(confirm|correct)$/;

export async function handleModerationReviewButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const match = interaction.customId.match(REVIEW_BUTTON);
  if (!match || !interaction.guildId) return;

  const targetId = Number(match[1]);
  const action = match[2];
  const lang = await LanguageService.getLanguage(interaction.guildId);
  const t = getTranslation(lang);

  if (!(await canReviewModeration(interaction))) {
    await interaction.reply({ content: t.aiMod.no_permission, ephemeral: true });
    return;
  }

  const target = await ModerationRunsService.getTarget(targetId);
  const run = target ? await ModerationRunsService.getRun(target.runId) : null;
  if (!target || !run) {
    await interaction.reply({ content: t.aiMod.review_target_missing, ephemeral: true });
    return;
  }

  if (action === "correct") {
    const modal = new ModalBuilder()
      .setCustomId(`modreview_correct:${targetId}`)
      .setTitle(t.aiMod.review_correct_title)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("expected_label")
            .setLabel(t.aiMod.review_expected_label)
            .setPlaceholder(run.feature === "ai-mod" ? "allow, malicious, selfpromo" : "allow, job_offer")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("reason")
            .setLabel(t.aiMod.review_reason_label)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  const confirmed = await ModerationReviewService.confirm(
    targetId,
    interaction.guildId,
    run.feature,
    interaction.user.id,
  );
  if (!confirmed) {
    await interaction.reply({ content: t.aiMod.case_already_resolved, ephemeral: true });
    return;
  }

  await interaction.message.edit({ components: [] });
  await interaction.reply({ content: t.aiMod.review_confirmed, ephemeral: true });
}
