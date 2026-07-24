import { ButtonInteraction, PermissionFlagsBits } from "discord.js";
import { CasesService } from "../services/cases.service";
import { MaliciousMessagesService } from "../services/malicious-messages.service";
import { FeedbackService } from "../services/feedback.service";
import { AiPromptsService } from "../services/ai-prompts.service";
import { ModRoleService } from "../services/mod-role.service";
import { NotifyTargetsService } from "../services/notify-targets.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

type FeedbackAction = "correct" | "incorrect";

export async function handleFeedbackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const parts = interaction.customId.split("_");
  // ["aimod", "<caseId>", "correct"|"incorrect"]
  if (parts.length < 3) return;
  const caseId = Number(parts[1]);
  const action = parts[2] as FeedbackAction;
  if (Number.isNaN(caseId) || (action !== "correct" && action !== "incorrect")) return;

  // Permission: ManageMessages, OR a role in mod_roles, OR a user in notify_targets.
  const member = interaction.member;
  const hasManageMessages =
    !!member && "permissions" in member &&
    (member as { permissions: { has: (p: unknown) => boolean } }).permissions?.has(PermissionFlagsBits.ManageMessages);

  let allowed = !!hasManageMessages;
  if (!allowed) {
    const [modRoles, notifyTargets] = await Promise.all([
      ModRoleService.list(guildId),
      NotifyTargetsService.list(guildId),
    ]);
    const memberRoleIds =
      member && "roles" in member
        ? (member as { roles: { cache: { has: (r: string) => boolean } } }).roles?.cache
        : null;
    allowed =
      modRoles.some((r) => memberRoleIds?.has(r.roleId)) ||
      notifyTargets.some((n) => n.targetType === "user" && n.targetId === interaction.user.id);
  }
  if (!allowed) {
    await interaction.reply({ content: t.aiMod.no_permission, ephemeral: true });
    return;
  }

  // Acknowledge immediately so the clicker sees something happened.
  const actionLabel = action === "correct" ? t.aiMod.button_correct : t.aiMod.button_incorrect;
  await interaction.reply({
    content: t.aiMod.feedback_processing
      .replace("{action}", actionLabel)
      .replace("{id}", String(caseId)),
    ephemeral: true,
  });

  const caseRow = await CasesService.get(caseId);
  if (!caseRow || caseRow.resolved) {
    await interaction.editReply({ content: t.aiMod.case_already_resolved });
    return;
  }

  const steps: string[] = [];
  const clickerTag = interaction.user.username;
  let timeoutRemoved = false;

  if (action === "correct") {
    await MaliciousMessagesService.addIfAbsent(caseRow.guildId, caseRow.content, true);
    steps.push(t.aiMod.feedback_action_malicious_true);
  } else {
    await MaliciousMessagesService.addIfAbsent(caseRow.guildId, caseRow.content, false);
    steps.push(t.aiMod.feedback_action_malicious_false);

    try {
      const guild = interaction.guild;
      if (guild) {
        const offender = await guild.members.fetch(caseRow.authorId).catch(() => null);
        if (!offender) {
          steps.push(t.aiMod.feedback_action_timeout_not_removed);
        } else if (!offender.isCommunicationDisabled()) {
          steps.push(t.aiMod.feedback_action_timeout_not_removed);
        } else {
          try {
            await offender.timeout(null, "ai-mod feedback: marked incorrect");
            timeoutRemoved = true;
            steps.push(t.aiMod.feedback_action_timeout_removed);
          } catch (e) {
            logger.warn(`ai-mod feedback: failed to remove timeout: ${e}`);
            steps.push(t.aiMod.feedback_action_timeout_remove_failed.replace("{error}", String(e)));
          }
        }
      }
    } catch (e) {
      logger.warn(`ai-mod feedback: error removing timeout: ${e}`);
    }
  }

  const note =
    action === "correct"
      ? await FeedbackService.generateTruePositivePrompt(
          caseRow.content,
          caseRow.verdict,
          caseRow.confidence,
          caseRow.reason ?? "",
          lang,
        )
      : await FeedbackService.generateAntiFpPrompt(
          caseRow.content,
          caseRow.verdict,
          caseRow.confidence,
          caseRow.reason ?? "",
          lang,
        );

  let promptSaved = false;
  if (note) {
    steps.push(t.aiMod.feedback_action_prompt_generated.replace("{prompt}", note));
    try {
      await AiPromptsService.add(caseRow.guildId, note);
      steps.push(t.aiMod.feedback_action_prompt_saved);
      promptSaved = true;
    } catch (e) {
      logger.warn(`ai-mod feedback (${action}): failed to insert ai_prompt: ${e}`);
      steps.push(t.aiMod.feedback_action_prompt_save_failed.replace("{error}", String(e)));
    }
  } else {
    steps.push(t.aiMod.feedback_action_no_prompt);
  }

  if (promptSaved) {
    await CasesService.markResolved(caseId, interaction.user.id, action);
    steps.push(t.aiMod.feedback_action_case_resolved.replace("{id}", String(caseId)));
  } else {
    const err = note ? "prompt save failed" : "AI unavailable";
    await CasesService.markFeedbackPending(caseId, interaction.user.id, action, err);
    steps.push(t.aiMod.feedback_action_prompt_pending.replace("{id}", String(caseId)));
  }

  const summary =
    `${t.aiMod.feedback_done_title.replace("{action}", actionLabel).replace("{user}", clickerTag)}\n\n` +
    steps.join("\n");
  await interaction.editReply({ content: summary });

  if (promptSaved) {
    await disableButtonsAndNote(interaction, action, clickerTag, t, timeoutRemoved);
  }
}

async function disableButtonsAndNote(
  interaction: ButtonInteraction,
  action: FeedbackAction,
  clickerTag: string,
  t: ReturnType<typeof getTranslation>,
  timeoutRemoved: boolean,
): Promise<void> {
  const extra =
    action === "correct"
      ? t.aiMod.confirmed_by.replace("{user}", clickerTag)
      : timeoutRemoved
        ? `${t.aiMod.marked_incorrect_by.replace("{user}", clickerTag)}\n${t.aiMod.timeout_removed}`
        : t.aiMod.marked_incorrect_by.replace("{user}", clickerTag);
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
    logger.warn(`ai-mod feedback: failed to update alert message: ${e}`);
  }
}
