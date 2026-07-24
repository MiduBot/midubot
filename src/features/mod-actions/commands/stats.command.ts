import type { Message } from "discord.js";
import { ModActionService } from "../services/mod-action.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

const ACTION_EMOJI: Record<string, string> = {
  puff: "💨",
  report_quorum: "🚨",
  image_duplicate: "📸",
  link_cooldown: "🔗",
  line_filter: "🗑️",
};

export async function handleStatsCommand(
  message: Message,
  _args: string[],
  _prefix: string,
): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;
  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [stats, topTargets, thisWeekTotal, twoWeekTotal] = await Promise.all([
    ModActionService.getStats(guildId, weekAgo),
    ModActionService.getTopTargets(guildId, weekAgo),
    ModActionService.getTotalSince(guildId, weekAgo),
    ModActionService.getTotalSince(guildId, twoWeeksAgo),
  ]);
  const lastWeekTotal = twoWeekTotal - thisWeekTotal;
  const statLines = stats.map((s) => {
    const emoji = ACTION_EMOJI[s.actionType] ?? "⚡";
    return `${emoji} \`${s.actionType}\`: **${s.total}**`;
  });

  const topLines = topTargets.map(
    (t, i) => `${i + 1}. <@${t.targetUserId}> — **${t.total}**`,
  );

  const fields = [
    {
      name: t.mod_actions.stats_by_type,
      value: statLines.length > 0 ? statLines.join("\n") : t.mod_actions.stats_no_actions,
      inline: false,
    },
    {
      name: t.mod_actions.stats_top_users,
      value: topLines.length > 0 ? topLines.join("\n") : "—",
      inline: false,
    },
    {
      name: t.mod_actions.stats_comparison,
      value: `${t.mod_actions.stats_this_week}: **${thisWeekTotal}** · ${t.mod_actions.stats_last_week}: **${lastWeekTotal}**`,
      inline: false,
    },
  ];

  await message.reply({
    embeds: [
      {
        color: 0x5865f2,
        title: t.mod_actions.stats_title,
        fields,
        footer: { text: t.mod_actions.stats_footer },
        timestamp: now.toISOString(),
      },
    ],
  });
}
