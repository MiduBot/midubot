import type { Message } from "discord.js";
import { ModActionService } from "../services/mod-action.service";
import { ModNotesService } from "../services/mod-notes.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { parseUserId, resolveDisplayName } from "@/core/discord/formatters";

const ACTION_EMOJI: Record<string, string> = {
  puff: "💨",
  report_quorum: "🚨",
  image_duplicate: "📸",
  link_cooldown: "🔗",
  line_filter: "🗑️",
};

const HISTORY_NOTES_LIMIT = 5;

export async function handleHistoryCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;
  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const userId = args[0] ? parseUserId(args[0]) : null;
  if (!userId) {
    await message.reply(t.mod_actions.history_usage.replace("{prefix}", prefix));
    return;
  }

  const [actions, notes] = await Promise.all([
    ModActionService.getHistory(guildId, userId),
    ModNotesService.getNotes(guildId, userId, HISTORY_NOTES_LIMIT),
  ]);

  if (actions.length === 0 && notes.length === 0) {
    await message.reply(t.mod_actions.history_empty.replace("{user}", userId));
    return;
  }

  const displayName = await resolveDisplayName(message.client, userId);

  const actionLines = actions.map((a) => {
    const emoji = ACTION_EMOJI[a.actionType] ?? "⚡";
    const ts = Math.floor((a.createdAt?.getTime() || Date.now()) / 1000);
    const executor = a.executorId ? `<@${a.executorId}>` : "auto";
    const reason = a.reason ? ` — ${a.reason}` : "";
    return `${emoji} \`${a.actionType}\` · <t:${ts}:R> · ${executor}${reason}`;
  });

  const noteLines = notes.map((n) => {
    const ts = Math.floor((n.createdAt?.getTime() || Date.now()) / 1000);
    const author = `<@${n.authorId}>`;
    const content = n.content.length > 200 ? `${n.content.slice(0, 200)}…` : n.content;
    return `📝 **#${n.id}** · ${author} · <t:${ts}:R>\n${content}`;
  });

  const sections: string[] = [];
  if (actionLines.length > 0) {
    sections.push(`### ${t.mod_actions.history_actions}\n${actionLines.join("\n")}`);
  }
  if (noteLines.length > 0) {
    sections.push(`### ${t.mod_actions.history_notes_section}\n${noteLines.join("\n\n")}`);
  }

  await message.reply({
    embeds: [
      {
        color: 0xff9900,
        title: t.mod_actions.history_title.replace("{user}", displayName),
        description: sections.join("\n\n"),
        footer: {
          text: t.mod_actions.history_footer.replace("{count}", String(actions.length)),
        },
      },
    ],
  });
}
