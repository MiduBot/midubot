import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { listStates, buildListEmbed } from "../commands/list-state";
import { ITEMS_PER_PAGE } from "../types";

export async function handleImagesButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  const messageId = interaction.message.id;
  const state = listStates.get(messageId);
  if (!state) {
    await interaction.reply({
      content: "This list has expired. Please run the command again.",
      ephemeral: true,
    });
    return;
  }

  const lang = await LanguageService.getLanguage(interaction.guildId!);
  const t = getTranslation(lang);

  if (interaction.customId === "images_prev") {
    state.page = Math.max(0, state.page - 1);
    await interaction.update(buildListEmbed(state, t));
  } else if (interaction.customId === "images_next") {
    const filtered = state.filter
      ? state.images.filter((img) =>
          img.name.toLowerCase().includes(state.filter.toLowerCase()),
        )
      : state.images;
    const totalPages = Math.max(
      1,
      Math.ceil(filtered.length / ITEMS_PER_PAGE),
    );
    state.page = Math.min(totalPages - 1, state.page + 1);
    await interaction.update(buildListEmbed(state, t));
  } else if (interaction.customId === "images_filter") {
    const modal = new ModalBuilder()
      .setCustomId(`images_filter_modal:${messageId}`)
      .setTitle(t.images.filter_modal_title);

    const input = new TextInputBuilder()
      .setCustomId("filter_name")
      .setLabel(t.images.filter_modal_label)
      .setPlaceholder(t.images.filter_modal_placeholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100);

    const actionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  } else if (interaction.customId === "images_clear") {
    state.filter = "";
    state.page = 0;
    await interaction.update(buildListEmbed(state, t));
  }
}

export async function handleImagesModalInteraction(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const customId = interaction.customId;
  const parts = customId.split(":");
  if (parts.length < 2) return;
  const messageId = parts[1];

  const state = listStates.get(messageId);
  if (!state) {
    await interaction.reply({
      content: "This list has expired. Please run the command again.",
      ephemeral: true,
    });
    return;
  }

  const lang = await LanguageService.getLanguage(interaction.guildId!);
  const t = getTranslation(lang);

  const filterValue = interaction.fields
    .getTextInputValue("filter_name")
    .trim();
  state.filter = filterValue;
  state.page = 0;

  await interaction.deferUpdate();
  try {
    const msg = await interaction.channel?.messages.fetch(messageId);
    if (msg) {
      await msg.edit(buildListEmbed(state, t));
    }
  } catch {
    // message may have been deleted
  }
}
