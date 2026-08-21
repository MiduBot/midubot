import { MessageFlags, type ButtonInteraction } from "discord.js";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import {
  ChatFeedbackService,
  type ChatFeedbackRating,
} from "../services/chat-feedback.service";

export async function handleChatFeedbackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const match = interaction.customId.match(/^chatfb_([^_]+)_(up|down)$/);
  if (!match) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await ChatFeedbackService.rate(
    match[1],
    interaction.user.id,
    match[2] as ChatFeedbackRating,
  );
  const lang = interaction.guildId
    ? await LanguageService.getLanguage(interaction.guildId)
    : "es";
  const t = getTranslation(lang);

  if (result === "recorded") {
    await interaction.editReply({ content: t.ai.feedback_thanks });
    await interaction.message.edit({ components: [] }).catch(() => {});
    return;
  }
  if (result === "forbidden") {
    await interaction.editReply({ content: t.ai.feedback_forbidden });
    return;
  }
  if (result === "already_rated") {
    await interaction.editReply({ content: t.ai.feedback_already });
    return;
  }
  await interaction.editReply({ content: t.ai.feedback_missing });
}
