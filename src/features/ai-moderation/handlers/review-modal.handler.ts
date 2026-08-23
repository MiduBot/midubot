import type { ModalSubmitInteraction } from "discord.js";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { ModerationReviewService } from "../services/review.service";
import { ModerationRunsService } from "../services/runs.service";
import { canReviewModeration } from "../services/review-permissions.service";

const REVIEW_MODAL = /^modreview_correct:(\d+)$/;

function isAllowedLabel(feature: "ai-mod" | "job-guard", label: string): boolean {
  if (label === "allow") return true;
  return feature === "ai-mod"
    ? label === "malicious" || label === "selfpromo"
    : label === "job_offer";
}

export async function handleModerationReviewModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const match = interaction.customId.match(REVIEW_MODAL);
  if (!match || !interaction.guildId) return;

  const targetId = Number(match[1]);
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

  const expectedLabel = interaction.fields.getTextInputValue("expected_label").trim().toLowerCase();
  const reasonValue = interaction.fields.getTextInputValue("reason").trim();
  if (!isAllowedLabel(run.feature, expectedLabel)) {
    await interaction.reply({ content: t.aiMod.review_invalid_label, ephemeral: true });
    return;
  }

  const corrected = await ModerationReviewService.correct({
    targetId,
    guildId: interaction.guildId,
    feature: run.feature,
    expectedLabel: expectedLabel as "allow" | "job_offer" | "malicious" | "selfpromo",
    reason: reasonValue || null,
    reviewerId: interaction.user.id,
  });
  if (!corrected) {
    await interaction.reply({ content: t.aiMod.case_already_resolved, ephemeral: true });
    return;
  }

  if (expectedLabel === "allow") {
    const member = await interaction.guild?.members.fetch(target.authorId).catch(() => null);
    if (member?.isCommunicationDisabled()) {
      await member.timeout(null, "moderation review correction: allow").catch(() => {});
    }
  }

  if (interaction.message) await interaction.message.edit({ components: [] });
  await interaction.reply({ content: t.aiMod.review_corrected, ephemeral: true });
}
