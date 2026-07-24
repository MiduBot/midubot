import {
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { ModNotesService } from "../services/mod-notes.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { isSuperdev } from "@/config/env";

const MODAL_ID_PREFIX = "mod_note_modal:";

export async function handleNoteContextMenu(
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
    await interaction.reply({ content: t.mod_actions.no_permission, ephemeral: true });
    return;
  }

  if (!isSuperdev(interaction.user.id) && !member.permissions.has("ManageMessages")) {
    await interaction.reply({ content: t.mod_actions.no_permission, ephemeral: true });
    return;
  }

  const targetUserId = interaction.targetMessage.author.id;

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_ID_PREFIX}${targetUserId}`)
    .setTitle(t.mod_actions.note_modal_title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("note_content")
          .setLabel(t.mod_actions.note_modal_label)
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleNoteUserContextMenu(
  interaction: UserContextMenuCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const lang = await LanguageService.getLanguage(guild.id);
  const t = getTranslation(lang);

  let member;
  try {
    member = await guild.members.fetch(interaction.user.id);
  } catch {
    await interaction.reply({ content: t.mod_actions.no_permission, ephemeral: true });
    return;
  }

  if (!isSuperdev(interaction.user.id) && !member.permissions.has("ManageMessages")) {
    await interaction.reply({ content: t.mod_actions.no_permission, ephemeral: true });
    return;
  }

  const targetUserId = interaction.targetUser.id;

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_ID_PREFIX}${targetUserId}`)
    .setTitle(t.mod_actions.note_modal_title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("note_content")
          .setLabel(t.mod_actions.note_modal_label)
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleNoteModalSubmit(
  interaction: import("discord.js").ModalSubmitInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const lang = await LanguageService.getLanguage(guild.id);
  const t = getTranslation(lang);

  const targetUserId = interaction.customId.slice(MODAL_ID_PREFIX.length);
  const content = interaction.fields.getTextInputValue("note_content").trim();

  if (!content) {
    await interaction.reply({ content: t.mod_actions.note_empty, ephemeral: true });
    return;
  }

  const note = await ModNotesService.addNote(
    guild.id,
    targetUserId,
    interaction.user.id,
    content,
  );

  await interaction.reply({
    content: t.mod_actions.note_added
      .replace("{id}", String(note.id))
      .replace("{user}", targetUserId),
    ephemeral: true,
  });
}
