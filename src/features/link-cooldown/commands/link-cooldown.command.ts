import { Message, ChannelType } from "discord.js";
import {
  LinkCooldownService,
  formatDuration,
  parseDuration,
  type LinkCooldownMode,
} from "../services/link-cooldown.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

function parseChannelId(input: string): string | null {
  if (input.startsWith("<#") && input.endsWith(">")) {
    return input.slice(2, -1);
  }
  if (/^\d+$/.test(input)) return input;
  return null;
}

function resolveUserId(input: string, guild: any): string | null {
  if (input.startsWith("<@!") && input.endsWith(">")) {
    return input.slice(3, -1);
  }
  if (input.startsWith("<@") && input.endsWith(">")) {
    return input.slice(2, -1);
  }
  if (/^\d+$/.test(input)) return input;
  if (!guild) return null;
  const member = guild.members.cache.find(
    (m: any) =>
      m.user.username.toLowerCase() === input.toLowerCase() ||
      (m.user.globalName ?? "").toLowerCase() === input.toLowerCase(),
  );
  return member?.id ?? null;
}

export async function handleLinkCooldownCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;
  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  if (args.length < 1) {
    await message.reply(t.linkcooldown.usage.replace("{prefix}", prefix));
    return;
  }

  const sub = args[0].toLowerCase();

  try {
    if (sub === "add" || sub === "a") {
      await handleAdd(message, guildId, args, t, prefix);
    } else if (sub === "remove" || sub === "rm" || sub === "delete") {
      await handleRemove(message, guildId, args, t);
    } else if (sub === "list" || sub === "ls" || sub === "l") {
      await handleList(message, guildId, t);
    } else if (sub === "mode" || sub === "m") {
      await handleMode(message, guildId, args, t);
    } else if (sub === "max") {
      await handleMax(message, guildId, args, t);
    } else if (sub === "window" || sub === "w") {
      await handleWindow(message, guildId, args, t);
    } else if (sub === "enable" || sub === "on") {
      await handleToggle(message, guildId, args, t, true);
    } else if (sub === "disable" || sub === "off") {
      await handleToggle(message, guildId, args, t, false);
    } else if (sub === "status" || sub === "s") {
      await handleStatus(message, guildId, args, t);
    } else if (sub === "reset" || sub === "r") {
      await handleReset(message, guildId, args, t);
    } else {
      await message.reply(t.linkcooldown.usage.replace("{prefix}", prefix));
    }
  } catch (error) {
    logger.error("Error handling linkcooldown command", error);
    await message.reply(t.commands.error);
  }
}

function requireChannel(
  message: Message,
  raw: string,
  t: ReturnType<typeof getTranslation>,
): string | null {
  const id = parseChannelId(raw);
  if (!id) {
    message.reply(t.linkcooldown.channel_invalid).catch(() => {});
    return null;
  }
  const channel = message.guild?.channels.cache.get(id);
  if (!channel || channel.type !== ChannelType.GuildText) {
    message.reply(t.linkcooldown.channel_not_found).catch(() => {});
    return null;
  }
  return id;
}

async function handleAdd(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  prefix: string,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.linkcooldown.add_usage.replace("{prefix}", prefix));
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;

  const mode =
    (args[2]?.toLowerCase() as LinkCooldownMode | undefined) ?? "same";
  if (mode !== "same" && mode !== "any") {
    await message.reply(t.linkcooldown.invalid_mode);
    return;
  }

  const defaultMax = mode === "any" ? 2 : 1;
  const defaultWindow = "1d";

  const maxArg = args[3] ? parseInt(args[3], 10) : defaultMax;
  if (!Number.isFinite(maxArg) || maxArg < 1 || maxArg > 50) {
    await message.reply(t.linkcooldown.invalid_max);
    return;
  }

  const winArg = args[4] ?? defaultWindow;
  const winMs = parseDuration(winArg);
  if (!winMs || winMs < 1000 || winMs > 30 * 24 * 60 * 60 * 1000) {
    await message.reply(t.linkcooldown.invalid_window);
    return;
  }

  const cfg = await LinkCooldownService.addChannel(guildId, id, {
    mode,
    maxLinks: maxArg,
    windowMs: winMs,
  });

  await message.reply(
    t.linkcooldown.add_done
      .replace("{channel}", `<#${cfg.channelId}>`)
      .replace("{mode}", cfg.mode)
      .replace("{max}", String(cfg.maxLinks))
      .replace("{window}", formatDuration(cfg.windowMs)),
  );
}

async function handleRemove(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.linkcooldown.remove_usage);
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;

  const ok = await LinkCooldownService.removeChannel(guildId, id);
  if (!ok) {
    await message.reply(t.linkcooldown.not_configured);
    return;
  }
  await message.reply(t.linkcooldown.removed.replace("{channel}", `<#${id}>`));
}

async function handleList(
  message: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  const list = await LinkCooldownService.listChannels(guildId);
  if (list.length === 0) {
    await message.reply(t.linkcooldown.list_empty);
    return;
  }

  const lines = list.map((c) => {
    const status = c.enabled ? "🟢" : "🔴";
    return `${status} <#${c.channelId}> — \`${c.mode}\` · \`max=${c.maxLinks}\` · \`win=${formatDuration(c.windowMs)}\``;
  });

  const embed = {
    color: 0x0099ff,
    title: t.linkcooldown.list_title,
    description: lines.join("\n"),
    footer: { text: `${list.length} channel(s)` },
  };
  await message.reply({ embeds: [embed] });
}

async function handleMode(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 3) {
    await message.reply(t.linkcooldown.mode_usage);
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;
  const mode = args[2].toLowerCase();
  if (mode !== "same" && mode !== "any") {
    await message.reply(t.linkcooldown.invalid_mode);
    return;
  }
  try {
    await LinkCooldownService.setMode(guildId, id, mode as LinkCooldownMode);
    await message.reply(
      t.linkcooldown.mode_set
        .replace("{channel}", `<#${id}>`)
        .replace("{mode}", mode),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await message.reply(
      msg === "channel_not_configured"
        ? t.linkcooldown.not_configured
        : t.linkcooldown.error.replace("{msg}", msg),
    );
  }
}

async function handleMax(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 3) {
    await message.reply(t.linkcooldown.max_usage);
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;
  const n = parseInt(args[2], 10);
  if (!Number.isFinite(n) || n < 1 || n > 50) {
    await message.reply(t.linkcooldown.invalid_max);
    return;
  }
  try {
    await LinkCooldownService.setMax(guildId, id, n);
    await message.reply(
      t.linkcooldown.max_set
        .replace("{channel}", `<#${id}>`)
        .replace("{n}", String(n)),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await message.reply(
      msg === "channel_not_configured"
        ? t.linkcooldown.not_configured
        : t.linkcooldown.error.replace("{msg}", msg),
    );
  }
}

async function handleWindow(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 3) {
    await message.reply(t.linkcooldown.window_usage);
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;
  const ms = parseDuration(args[2]);
  if (!ms || ms < 1000 || ms > 30 * 24 * 60 * 60 * 1000) {
    await message.reply(t.linkcooldown.invalid_window);
    return;
  }
  try {
    await LinkCooldownService.setWindow(guildId, id, ms);
    await message.reply(
      t.linkcooldown.window_set
        .replace("{channel}", `<#${id}>`)
        .replace("{window}", formatDuration(ms)),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await message.reply(
      msg === "channel_not_configured"
        ? t.linkcooldown.not_configured
        : t.linkcooldown.error.replace("{msg}", msg),
    );
  }
}

async function handleToggle(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  enabled: boolean,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.linkcooldown.toggle_usage);
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;
  try {
    await LinkCooldownService.setEnabled(guildId, id, enabled);
    await message.reply(
      (enabled ? t.linkcooldown.enabled : t.linkcooldown.disabled).replace(
        "{channel}",
        `<#${id}>`,
      ),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await message.reply(
      msg === "channel_not_configured"
        ? t.linkcooldown.not_configured
        : t.linkcooldown.error.replace("{msg}", msg),
    );
  }
}

async function handleStatus(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.linkcooldown.status_usage);
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;

  const cfg = await LinkCooldownService.getChannelConfig(guildId, id);
  if (!cfg) {
    await message.reply(t.linkcooldown.not_configured);
    return;
  }

  const recent = await LinkCooldownService.getRecentEntries(guildId, id, 5);
  const recentText =
    recent.length === 0
      ? t.linkcooldown.recent_none
      : recent
          .map((e) => {
            const ts = e.createdAt
              ? `<t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`
              : "?";
            return `• <@${e.userId}> — \`${e.url.slice(0, 80)}\` (${ts})`;
          })
          .join("\n");

  const embed = {
    color: cfg.enabled ? 0x00ff00 : 0xff0000,
    title: t.linkcooldown.status_title.replace("{channel}", `<#${id}>`),
    fields: [
      {
        name: t.linkcooldown.status_enabled,
        value: cfg.enabled ? "✅" : "❌",
        inline: true,
      },
      {
        name: t.linkcooldown.status_mode,
        value: `\`${cfg.mode}\``,
        inline: true,
      },
      {
        name: t.linkcooldown.status_max,
        value: String(cfg.maxLinks),
        inline: true,
      },
      {
        name: t.linkcooldown.status_window,
        value: formatDuration(cfg.windowMs),
        inline: true,
      },
      {
        name: t.linkcooldown.status_recent,
        value: recentText,
        inline: false,
      },
    ],
  };
  await message.reply({ embeds: [embed] });
}

async function handleReset(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  if (args.length < 3) {
    await message.reply(t.linkcooldown.reset_usage);
    return;
  }
  const id = requireChannel(message, args[1], t);
  if (!id) return;
  const userId = resolveUserId(args[2], message.guild);
  if (!userId) {
    await message.reply(t.linkcooldown.user_not_found);
    return;
  }

  const n = await LinkCooldownService.resetUser(guildId, id, userId);
  await message.reply(
    t.linkcooldown.reset_done
      .replace("{channel}", `<#${id}>`)
      .replace("{user}", `<@${userId}>`)
      .replace("{n}", String(n)),
  );
}
