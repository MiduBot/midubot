import { ButtonInteraction, PermissionFlagsBits } from "discord.js";
import { JobGuardCasesService } from "../services/cases.service";
import { JobGuardPromptsService } from "../services/prompts.service";
import { JobGuardFeedbackService } from "../services/feedback.service";
import { logger } from "@/core/logger";

type FeedbackAction = "correct" | "incorrect";

const NO_PERMISSION = "No tienes permiso para usar esto.";
const CASE_ALREADY_RESOLVED = "Este caso ya fue resuelto.";
const LABEL_CORRECT = "✅ Correcto";
const LABEL_INCORRECT = "❌ Incorrecto";

export async function handleJobGuardFeedbackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split("_");
  // ["jobguard", "<caseId>", "correct"|"incorrect"]
  if (parts.length < 3) return;
  const caseId = Number(parts[1]);
  const action = parts[2] as FeedbackAction;
  if (Number.isNaN(caseId) || (action !== "correct" && action !== "incorrect")) return;

  const member = interaction.member;
  const hasManageMessages =
    !!member &&
    "permissions" in member &&
    (member as { permissions: { has: (p: unknown) => boolean } }).permissions?.has(
      PermissionFlagsBits.ManageMessages,
    );
  if (!hasManageMessages) {
    await interaction.reply({ content: NO_PERMISSION, ephemeral: true });
    return;
  }

  const actionLabel = action === "correct" ? LABEL_CORRECT : LABEL_INCORRECT;
  await interaction.reply({
    content: `⏳ Procesando feedback **${actionLabel}** para el caso #${caseId}…`,
    ephemeral: true,
  });

  const caseRow = await JobGuardCasesService.get(caseId);
  if (!caseRow || caseRow.resolved) {
    await interaction.editReply({ content: CASE_ALREADY_RESOLVED });
    return;
  }

  const steps: string[] = [];
  const clickerTag = interaction.user.username;

  const note =
    action === "correct"
      ? await JobGuardFeedbackService.generateTruePositivePrompt(
          caseRow.content,
          caseRow.verdict,
          caseRow.confidence,
          caseRow.reason ?? "",
        )
      : await JobGuardFeedbackService.generateAntiFpPrompt(
          caseRow.content,
          caseRow.verdict,
          caseRow.confidence,
          caseRow.reason ?? "",
        );

  let promptSaved = false;
  if (note) {
    steps.push(`🤖 Prompt generado: "${note}"`);
    try {
      await JobGuardPromptsService.add(caseRow.guildId, note);
      steps.push("💾 Prompt guardado en `job_guard_prompts`");
      promptSaved = true;
    } catch (e) {
      logger.warn(`job-guard feedback (${action}): failed to insert prompt: ${e}`);
      steps.push(`✗ Error guardando prompt: ${String(e)}`);
    }
  } else {
    steps.push("⚠ No se pudo generar prompt (IA no disponible)");
  }

  if (promptSaved) {
    await JobGuardCasesService.markResolved(caseId, interaction.user.id, action);
    steps.push(`✓ Caso #${caseId} marcado como resuelto`);
  } else {
    const err = note ? "prompt save failed" : "AI unavailable";
    await JobGuardCasesService.markFeedbackPending(
      caseId,
      interaction.user.id,
      action,
      err,
    );
    steps.push(
      `⚠ Caso #${caseId} pendiente de prompt — reintenta el botón cuando la IA esté disponible`,
    );
  }

  const summary =
    `✅ Feedback **${actionLabel}** procesado por ${clickerTag}\n\n` + steps.join("\n");
  await interaction.editReply({ content: summary });

  if (promptSaved) {
    await disableButtonsAndNote(interaction, action, clickerTag);
  }
}

async function disableButtonsAndNote(
  interaction: ButtonInteraction,
  action: FeedbackAction,
  clickerTag: string,
): Promise<void> {
  const extra =
    action === "correct"
      ? `✅ Confirmado por ${clickerTag}`
      : `❌ Marcado como incorrecto por ${clickerTag}`;
  try {
    const message = interaction.message;
    const embeds = message.embeds.map((e) => e);
    if (embeds.length > 0) {
      const first = embeds[0];
      const builder = first.toJSON();
      builder.description = `${builder.description ?? ""}\n\n${extra}`.slice(0, 4096);
      await message.edit({ embeds: [builder], components: [] });
      return;
    }
    await message.edit({ content: extra, components: [] });
  } catch (e) {
    logger.warn(`job-guard feedback: failed to update alert message: ${e}`);
  }
}
