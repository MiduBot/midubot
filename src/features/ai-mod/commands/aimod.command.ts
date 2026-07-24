import { Message, PermissionFlagsBits } from "discord.js";
import { AiModConfigService } from "../services/ai-mod-config.service";
import {
  CasesService,
  type CaseFilter,
  type CaseRow,
} from "../services/cases.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { isSuperdev } from "@/config/env";
import { logger } from "@/core/logger";

const PAGE_SIZE = 10;

function verdictLabel(
  verdict: number,
  t: ReturnType<typeof getTranslation>,
): string {
  if (verdict === 1) return t.aiMod.case_verdict_malicious;
  if (verdict === 2) return t.aiMod.case_verdict_selfpromo;
  return t.aiMod.case_verdict_unknown;
}

function statusLabel(
  row: CaseRow,
  t: ReturnType<typeof getTranslation>,
): string {
  if (row.resolved) return t.aiMod.case_status_resolved;
  if (row.promptPending) return t.aiMod.case_status_prompt_pending;
  return t.aiMod.case_status_pending;
}

function snippet(content: string, max = 40): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function parseFilter(raw: string | undefined): CaseFilter | null {
  if (!raw) return "pending";
  const v = raw.toLowerCase();
  if (v === "pending" || v === "resolved" || v === "all") return v;
  return null;
}

export async function handleAimodCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_aimod.replace("{prefix}", prefix);

  if (!isSuperdev(message.author.id) && !message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 1) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  try {
    if (sub === "on") {
      await AiModConfigService.setEnabled(guildId, true);
      await message.reply(t.aiMod.enabled_on);
    } else if (sub === "off") {
      await AiModConfigService.setEnabled(guildId, false);
      await message.reply(t.aiMod.enabled_off);
    } else if (sub === "status") {
      const enabled = await AiModConfigService.isEnabled(guildId);
      await message.reply(enabled ? t.aiMod.enabled_status_on : t.aiMod.enabled_status_off);
    } else if (sub === "cases") {
      await handleCasesList(message, guildId, args.slice(1), t, usage);
    } else if (sub === "case") {
      await handleCaseDetail(message, guildId, args.slice(1), t, usage);
    } else {
      await message.reply(usage);
    }
  } catch (error) {
    logger.error("aimod command error", error);
    await message.reply(t.commands.error);
  }
}

async function handleCasesList(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  usage: string,
): Promise<void> {
  let filterArg: string | undefined;
  let pageArg: string | undefined;

  if (args[0] && /^\d+$/.test(args[0])) {
    pageArg = args[0];
  } else {
    filterArg = args[0];
    pageArg = args[1];
  }

  const filter = parseFilter(filterArg);
  if (!filter) {
    await message.reply(usage);
    return;
  }

  const page = Math.max(1, Number(pageArg ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const [total, rows] = await Promise.all([
    CasesService.count(guildId, filter),
    CasesService.list(guildId, filter, PAGE_SIZE, offset),
  ]);

  if (total === 0 || rows.length === 0) {
    await message.reply(t.aiMod.cases_empty.replace("{filter}", filter));
    return;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const header = t.aiMod.cases_header
    .replace("{filter}", filter)
    .replace("{page}", String(page))
    .replace("{pages}", String(pages))
    .replace("{total}", String(total));

  const lines = rows.map((row) =>
    t.aiMod.cases_row
      .replace("{id}", String(row.id))
      .replace("{verdict}", verdictLabel(row.verdict, t))
      .replace("{confidence}", row.confidence.toFixed(2))
      .replace("{status}", statusLabel(row, t))
      .replace("{snippet}", snippet(row.content)),
  );

  await message.reply(`${header}\n${lines.join("\n")}`);
}

async function handleCaseDetail(
  message: Message,
  guildId: string,
  args: string[],
  t: ReturnType<typeof getTranslation>,
  usage: string,
): Promise<void> {
  if (args.length < 1 || Number.isNaN(Number(args[0]))) {
    await message.reply(usage);
    return;
  }

  const id = Number(args[0]);
  const row = await CasesService.get(id);
  if (!row || row.guildId !== guildId) {
    await message.reply(t.aiMod.case_not_found.replace("{id}", String(id)));
    return;
  }

  const messageLink = `https://discord.com/channels/${row.guildId}/${row.channelId}/${row.messageId}`;
  const createdAt =
    row.createdAt instanceof Date && !Number.isNaN(row.createdAt.getTime())
      ? row.createdAt.toISOString()
      : row.createdAt && !(row.createdAt instanceof Date)
        ? String(row.createdAt)
        : t.aiMod.case_none;

  const detail = t.aiMod.case_detail
    .replace("{id}", String(row.id))
    .replace("{authorId}", row.authorId)
    .replace("{channelId}", row.channelId)
    .replace("{messageLink}", messageLink)
    .replace("{verdict}", verdictLabel(row.verdict, t))
    .replace("{confidence}", row.confidence.toFixed(2))
    .replace("{platform}", String(row.platform))
    .replace("{reason}", row.reason || t.aiMod.case_none)
    .replace("{actionTaken}", row.actionTaken || t.aiMod.case_none)
    .replace("{status}", statusLabel(row, t))
    .replace("{feedbackAction}", row.feedbackAction || t.aiMod.case_none)
    .replace("{promptPending}", row.promptPending ? "yes" : "no")
    .replace("{promptError}", row.promptError || t.aiMod.case_none)
    .replace("{createdAt}", createdAt);

  await message.reply(detail);
}
