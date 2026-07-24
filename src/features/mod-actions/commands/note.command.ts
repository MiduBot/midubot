import type { Message } from "discord.js";
import { ModNotesService } from "../services/mod-notes.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { parseUserId, resolveDisplayName } from "@/core/discord/formatters";

export async function handleNoteCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;
  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const sub = args[0]?.toLowerCase();

  if (sub === "add" || sub === "a") {
    const userId = args[1] ? parseUserId(args[1]) : null;
    if (!userId) {
      await message.reply(t.mod_actions.note_usage_add.replace("{prefix}", prefix));
      return;
    }
    const content = args.slice(2).join(" ").trim();
    if (!content) {
      await message.reply(t.mod_actions.note_empty);
      return;
    }
    const note = await ModNotesService.addNote(guildId, userId, message.author.id, content);
    await message.reply(
      t.mod_actions.note_added.replace("{id}", String(note.id)).replace("{user}", userId),
    );
    return;
  }

  if (sub === "list" || sub === "ls" || sub === "l") {
    const userId = args[1] ? parseUserId(args[1]) : null;
    if (!userId) {
      await message.reply(t.mod_actions.note_usage_list.replace("{prefix}", prefix));
      return;
    }
    const notes = await ModNotesService.getNotes(guildId, userId);
    if (notes.length === 0) {
      await message.reply(t.mod_actions.note_none.replace("{user}", userId));
      return;
    }
    const displayName = await resolveDisplayName(message.client, userId);
    const lines = notes.map(
      (n) =>
        `**#${n.id}** · <@${n.authorId}> · <t:${Math.floor((n.createdAt?.getTime() || Date.now()) / 1000)}:R>\n${n.content}`,
    );
    await message.reply({
      embeds: [
        {
          color: 0x5865f2,
          title: t.mod_actions.note_list_title.replace("{user}", displayName),
          description: lines.join("\n\n"),
        },
      ],
    });
    return;
  }

  if (sub === "remove" || sub === "rm" || sub === "del") {
    const id = Number(args[1]);
    if (isNaN(id)) {
      await message.reply(t.mod_actions.note_usage_remove.replace("{prefix}", prefix));
      return;
    }
    const removed = await ModNotesService.removeNote(id, guildId);
    await message.reply(removed ? t.mod_actions.note_removed : t.mod_actions.note_not_found);
    return;
  }

  await message.reply(t.mod_actions.note_usage.replace("{prefix}", prefix));
}
