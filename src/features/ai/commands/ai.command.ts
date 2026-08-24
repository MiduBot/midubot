import { ChannelType, Message, PermissionFlagsBits } from "discord.js";
import { isSuperdev } from "@/config/env";
import { AIClientService } from "@/features/ai-mod";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";
import {
  AiChatConfigService,
  type AiChatMode,
} from "../services/ai-chat-config.service";
import {
  AiChatAllowService,
  type AiChatAllowEntry,
  type AiChatAllowType,
} from "../services/ai-chat-allow.service";

const TEST_SYSTEM = "Responde de forma breve y concisa. No uses markdown.";
const TEST_USER = "Di 'La IA está funcionando correctamente' y nada más.";

export async function handleAiCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  const lang = guildId ? await LanguageService.getLanguage(guildId) : "es";
  const t = getTranslation(lang);
  const usage = t.ai.usage.replace("{prefix}", prefix);

  if (args.length < 1) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();

  if (sub === "test") {
    if (!isSuperdev(message.author.id)) {
      await message.reply(t.ai.no_permission);
      return;
    }
    await runTest(message, t);
    return;
  }

  if (!guildId) {
    await message.reply(t.commands.only_guild);
    return;
  }

  try {
    if (sub === "on" || sub === "enable") {
      await AiChatConfigService.setEnabled(guildId, true);
      await message.reply(t.ai.enabled_on);
      return;
    }
    if (sub === "off" || sub === "disable") {
      await AiChatConfigService.setEnabled(guildId, false);
      await message.reply(t.ai.enabled_off);
      return;
    }
    if (sub === "status") {
      await replyStatus(message, guildId, t);
      return;
    }
    if (sub === "channel") {
      await handleChannel(message, guildId, args.slice(1), t, prefix);
      return;
    }
    if (sub === "mode") {
      await handleMode(message, guildId, args.slice(1), t, prefix);
      return;
    }
    if (sub === "allow" || sub === "canuse") {
      await handleAllow(message, guildId, args.slice(1), t, prefix);
      return;
    }

    await message.reply(usage);
  } catch (error) {
    logger.error("ai command error", error);
    await message.reply(t.commands.error);
  }
}

async function replyStatus(
  message: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  const config = await AiChatConfigService.getConfig(guildId);
  const state = config.enabled ? t.ai.status_on : t.ai.status_off;
  const channel = config.channelId
    ? `<#${config.channelId}>`
    : t.ai.status_no_channel;
  const mode = config.mode === "mentions" ? t.ai.mode_mentions : t.ai.mode_ambient;
  const allowEntries = await AiChatAllowService.list(guildId);
  const allow =
    allowEntries.length === 0
      ? t.ai.status_allow_anyone
      : allowEntries.map((entry) => formatAllowEntry(entry, t)).join(", ");
  await message.reply(
    t.ai.status
      .replace("{state}", state)
      .replace("{channel}", channel)
      .replace("{mode}", mode)
      .replace("{allow}", allow),
  );
}

type Translations = ReturnType<typeof getTranslation>;

function formatAllowEntry(entry: AiChatAllowEntry, t: Translations): string {
  if (entry.type === "special" && entry.entityId === "superdev") {
    return t.ai.allow_superdev;
  }
  if (entry.type === "special" && entry.entityId === "mods") {
    return t.ai.allow_mods;
  }
  if (entry.type === "role") return `<@&${entry.entityId}>`;
  return `<@${entry.entityId}>`;
}

type ParsedAllowArg =
  | { kind: "any" }
  | { kind: "target"; type: AiChatAllowType; entityId: string }
  | { kind: "invalid"; raw: string };

function parseAllowArg(
  raw: string,
  message: Message,
): ParsedAllowArg {
  const token = raw.toLowerCase();
  if (token === "any" || token === "everyone" || token === "all" || token === "*") {
    return { kind: "any" };
  }
  if (token === "superdev" || token === "superdevs") {
    return { kind: "target", type: "special", entityId: "superdev" };
  }
  if (token === "mod" || token === "mods" || token === "staff") {
    return { kind: "target", type: "special", entityId: "mods" };
  }

  const roleMention = raw.match(/^<@&(\d+)>$/);
  if (roleMention) {
    return { kind: "target", type: "role", entityId: roleMention[1] };
  }
  const userMention = raw.match(/^<@!?(\d+)>$/);
  if (userMention) {
    return { kind: "target", type: "member", entityId: userMention[1] };
  }
  if (/^\d{17,19}$/.test(raw)) {
    if (message.guild?.roles?.cache.has(raw)) {
      return { kind: "target", type: "role", entityId: raw };
    }
    return { kind: "target", type: "member", entityId: raw };
  }
  return { kind: "invalid", raw };
}

function targetKey(type: AiChatAllowType, entityId: string): string {
  return `${type}:${entityId}`;
}

async function handleAllow(
  message: Message,
  guildId: string,
  args: string[],
  t: Translations,
  prefix: string,
): Promise<void> {
  const usage = t.ai.allow_usage.replace("{prefix}", prefix);
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "list" || sub === "ls" || sub === "l") {
    const list = await AiChatAllowService.list(guildId);
    if (list.length === 0) {
      await message.reply(t.ai.allow_anyone);
      return;
    }
    await message.reply({
      embeds: [
        {
          color: 0x0099ff,
          title: t.ai.allow_list_title,
          description: list
            .map((entry) => `• ${formatAllowEntry(entry, t)}`)
            .join("\n"),
        },
      ],
    });
    return;
  }

  if (
    sub === "any" ||
    sub === "reset" ||
    sub === "everyone" ||
    sub === "all" ||
    sub === "clear" ||
    sub === "off"
  ) {
    await AiChatAllowService.clear(guildId);
    await message.reply(t.ai.allow_cleared);
    return;
  }

  const isRemove =
    sub === "remove" || sub === "rm" || sub === "del" || sub === "delete";
  const isAdd = sub === "add" || sub === "a" || sub === "+";
  const rawTargets = isAdd || isRemove ? args.slice(1) : args;

  if (rawTargets.length === 0) {
    await message.reply(isAdd || isRemove ? t.ai.allow_empty_add : usage);
    return;
  }

  const parsed = rawTargets.map((raw) => parseAllowArg(raw, message));
  const invalid = parsed.filter((item) => item.kind === "invalid");
  const any = parsed.some((item) => item.kind === "any");
  const targets = parsed.filter(
    (item): item is Extract<ParsedAllowArg, { kind: "target" }> =>
      item.kind === "target",
  );

  if (invalid.length > 0) {
    await message.reply(
      t.ai.allow_invalid.replace(
        "{targets}",
        invalid.map((item) => `\`${item.raw}\``).join(", "),
      ),
    );
    return;
  }

  if (any) {
    if (isRemove || targets.length > 0) {
      await message.reply(t.ai.allow_any_mixed.replace("{prefix}", prefix));
      return;
    }
    await AiChatAllowService.clear(guildId);
    await message.reply(t.ai.allow_cleared);
    return;
  }

  if (targets.length === 0) {
    await message.reply(t.ai.allow_empty_add);
    return;
  }

  const unique = new Map<string, Extract<ParsedAllowArg, { kind: "target" }>>();
  for (const target of targets) {
    unique.set(targetKey(target.type, target.entityId), target);
  }

  if (isRemove) {
    const removed: string[] = [];
    const missing: string[] = [];
    for (const target of unique.values()) {
      const ok = await AiChatAllowService.remove(
        guildId,
        target.type,
        target.entityId,
      );
      const label = formatAllowEntry(target, t);
      if (ok) removed.push(label);
      else missing.push(label);
    }
    const lines: string[] = [];
    if (removed.length > 0) {
      lines.push(t.ai.allow_removed.replace("{targets}", removed.join(", ")));
    }
    if (missing.length > 0) {
      lines.push(t.ai.allow_not_found.replace("{targets}", missing.join(", ")));
    }
    await message.reply(lines.join("\n") || usage);
    return;
  }

  const added: string[] = [];
  const already: string[] = [];
  for (const target of unique.values()) {
    const result = await AiChatAllowService.add(
      guildId,
      target.type,
      target.entityId,
    );
    const label = formatAllowEntry(target, t);
    if (result === "added") added.push(label);
    else already.push(label);
  }
  const lines: string[] = [];
  if (added.length > 0) {
    lines.push(t.ai.allow_added.replace("{targets}", added.join(", ")));
  }
  if (already.length > 0) {
    lines.push(t.ai.allow_already.replace("{targets}", already.join(", ")));
  }
  await message.reply(lines.join("\n") || usage);
}

async function handleMode(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  prefix: string,
): Promise<void> {
  const mode = args[0]?.toLowerCase() as AiChatMode | undefined;
  if (mode !== "ambient" && mode !== "mentions") {
    await message.reply(t.ai.mode_usage.replace("{prefix}", prefix));
    return;
  }
  await AiChatConfigService.setMode(guildId, mode);
  await message.reply(
    t.ai.mode_set.replace(
      "{mode}",
      mode === "ambient" ? t.ai.mode_ambient : t.ai.mode_mentions,
    ),
  );
}

async function handleChannel(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  prefix: string,
): Promise<void> {
  if (args.length < 1) {
    await message.reply(t.ai.channel_usage.replace("{prefix}", prefix));
    return;
  }

  const raw = args[0].toLowerCase();
  if (raw === "off" || raw === "none" || raw === "clear") {
    await AiChatConfigService.clearChannel(guildId);
    await message.reply(t.ai.channel_cleared);
    return;
  }

  const mentionMatch = args[0].match(/^<#(\d+)>$/);
  let channelId: string | undefined;
  if (mentionMatch) {
    channelId = mentionMatch[1];
  } else if (/^\d{17,19}$/.test(args[0])) {
    channelId = args[0];
  } else {
    await message.reply(t.commands.invalid_channel_id);
    return;
  }

  const channel = await message.guild?.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    await message.reply(t.ai.channel_not_found);
    return;
  }
  if (channel.type !== ChannelType.GuildText) {
    await message.reply(t.ai.channel_must_be_text);
    return;
  }

  const member = message.member;
  if (
    !member ||
    !channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)
  ) {
    await message.reply(t.ai.channel_no_access);
    return;
  }

  const me = message.guild?.members.me;
  if (
    !me ||
    !channel.permissionsFor(me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ])
  ) {
    await message.reply(t.ai.channel_bot_no_access);
    return;
  }

  await AiChatConfigService.setChannel(guildId, channelId);
  await message.reply(t.ai.channel_set.replace("{channelId}", channelId));
}

async function runTest(
  message: Message,
  t: ReturnType<typeof getTranslation>,
): Promise<void> {
  const reply = await message.reply(t.ai.testing);
  const start = Date.now();

  try {
    const result = await AIClientService.chatMessagesDetailed(
      TEST_SYSTEM,
      [{ role: "user", content: TEST_USER }],
      { temperature: 0 },
    );
    const elapsed = Date.now() - start;

    if (!result) {
      await reply.edit(t.ai.fail);
      return;
    }

    await reply.edit(
      t.ai.ok
        .replace("{elapsed}", String(elapsed))
        .replace("{model}", result.model)
        .replace("{response}", result.text.slice(0, 1800)),
    );
  } catch (error) {
    logger.error("ai test command error", error);
    await reply.edit(t.ai.error);
  }
}
