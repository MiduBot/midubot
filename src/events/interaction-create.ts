import { Interaction, StringSelectMenuInteraction, CacheType } from "discord.js";
import { handleReportContextMenu } from "@/features/reports";
import { handlePuffContextMenu } from "@/features/puff";
import { handleNoteContextMenu, handleNoteUserContextMenu, handleNoteModalSubmit } from "@/features/mod-actions";
import {
  handleImagesButtonInteraction,
  handleImagesModalInteraction,
} from "@/features/images";
import { handleFeedbackButton } from "@/features/ai-mod";
import { handleJobGuardFeedbackButton } from "@/features/job-guard";
import { handleModerationReviewButton } from "@/features/ai-moderation/handlers/review-button.handler";
import { handleModerationReviewModal } from "@/features/ai-moderation/handlers/review-modal.handler";
import { WhitelistService } from "@/features/whitelist";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";
import { handleHelpSelect, handleHelpButton } from "@/commands/help";

export async function handleInteractionCreate(
  interaction: Interaction,
): Promise<void> {
  try {
    if (interaction.isMessageContextMenuCommand()) {
      if (interaction.commandName === "Reportar") {
        await handleReportContextMenu(interaction);
      } else if (interaction.commandName === "Puff") {
        await handlePuffContextMenu(interaction);
      } else if (interaction.commandName === "Añadir Nota") {
        await handleNoteContextMenu(interaction);
      }
      return;
    }

    if (interaction.isUserContextMenuCommand()) {
      if (interaction.commandName === "Añadir Nota") {
        await handleNoteUserContextMenu(interaction);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "whitelist_permission_select") {
        await handleWhitelistSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith("help_select")) {
        await handleHelpSelect(interaction);
        return;
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("modreview_")) {
        await handleModerationReviewButton(interaction);
        return;
      }
      if (interaction.customId.startsWith("aimod_")) {
        await handleFeedbackButton(interaction);
        return;
      }
      if (interaction.customId.startsWith("jobguard_")) {
        await handleJobGuardFeedbackButton(interaction);
        return;
      }
      if (interaction.customId.startsWith("images_")) {
        await handleImagesButtonInteraction(interaction);
        return;
      }
      if (
        interaction.customId.startsWith("help_home") ||
        interaction.customId.startsWith("help_back") ||
        interaction.customId.startsWith("help_close")
      ) {
        await handleHelpButton(interaction);
        return;
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("modreview_correct:")) {
        await handleModerationReviewModal(interaction);
      } else if (interaction.customId.startsWith("images_filter_modal")) {
        await handleImagesModalInteraction(interaction);
      } else if (interaction.customId.startsWith("mod_note_modal:")) {
        await handleNoteModalSubmit(interaction);
      }
      return;
    }
  } catch (error) {
    logger.error("Error handling interaction", error);
    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit() ||
      interaction.isMessageContextMenuCommand() ||
      interaction.isUserContextMenuCommand()
    ) {
      const replyOptions = {
        content: "An error occurred while processing your request.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch(() => {});
      } else {
        await interaction.reply(replyOptions).catch(() => {});
      }
    }
  }
}

async function handleWhitelistSelect(
  interaction: StringSelectMenuInteraction<CacheType>,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const lang = await LanguageService.getLanguage(guild.id);
  const t = getTranslation(lang);
  const selectedPermission = interaction.values[0];

  try {
    await WhitelistService.addWhitelist(guild.id, "permission", selectedPermission);
    await interaction.update({
      content: t.whitelist.added,
      components: [],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await interaction.update({
      content: t.whitelist.add_error.replace("{msg}", msg),
      components: [],
    });
  }
}
