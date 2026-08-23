import type { Message, TextChannel, Guild } from "discord.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { env } from "@/config/env";
import { isIgnored } from "@/core/discord/ignored-channels";
import { logger } from "@/core/logger";
import { safeDelete, safeTimeout, extractImageUrls } from "@/core/discord/moderation";
import { LogChannelService } from "@/features/log-channel";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { extractPuffContent } from "@/features/puff";
import { ImageService, ImageHashService } from "@/features/images";

import { AiModConfigService } from "../services/ai-mod-config.service";
import { ModRoleService } from "../services/mod-role.service";
import { SelfpromoBypassService } from "../services/selfpromo-bypass.service";
import { NotifyTargetsService } from "../services/notify-targets.service";
import { ContextBuilderService } from "../services/context-builder.service";
import { classifyBatch } from "../services/classifier.service";
import { ImageDuplicateService } from "../services/image-duplicate.service";
import { CasesService } from "../services/cases.service";
import { SanctionCache } from "../services/sanction-cache.service";
import {
  AI_MOD_POLICY,
  buildAiModPrompts,
  buildAiModUserPrompt,
} from "../services/moderation-policy.service";
import {
  classifySelfpromoPlatform,
} from "../services/selfpromo-platform.service";
import {
  collectReportEvidence,
  type ReportEvidence,
} from "../services/report-evidence.service";
import { enforceAiModDecision } from "../services/moderation-enforcement.service";
import {
  buildFlaggedEmbed,
  buildPrecautionEmbed,
  buildPingString,
} from "../services/alert-builder.service";
import { buildReviewCard } from "@/features/ai-moderation/services/review-card.service";
import {
  prepareEvidenceFiles,
  type AttachmentPayload,
} from "@/features/ai-moderation/services/evidence-files.service";
import {
  adjudicate,
  evaluateDual,
  ModerationConfigService,
  ModerationReviewService,
  ModerationRunsService,
} from "@/features/ai-moderation";
import type {
  AdjudicationResult,
  DualEvaluationResult,
  EvaluationAttempt,
  ModerationCandidate,
  ModerationLabel,
  ModerationMode,
} from "@/features/ai-moderation";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_THRESHOLD = 0.5;
const BYPASS_PLATFORMS = new Set([1, 2, 3]);
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface FlaggedCandidate {
  message: Message;
  verdict: 1 | 2;
  confidence: number;
  platform: number;
  reason: string;
  fromImage: boolean;
  crossChannelMessages?: Message[];
}

interface PrecautionCandidate {
  message: Message;
  verdict: number;
  confidence: number;
  platform: number;
  reason: string;
}

interface PreparedAdjudication {
  evaluation: DualEvaluationResult;
  adjudication: AdjudicationResult;
  runId: number;
  targetIdsByCandidate: Map<number, number>;
}

function firstViolation(attempts: readonly EvaluationAttempt[]): {
  attempt: Extract<EvaluationAttempt, { status: "ok" }>;
  target: { candidateIndex: number; label: ModerationLabel };
} | null {
  for (const attempt of attempts) {
    if (attempt.status !== "ok" || attempt.evaluation.outcome !== "violation") continue;
    const target = attempt.evaluation.targets[0];
    if (target) return { attempt, target };
  }
  return null;
}

function platformNumber(content: string): number {
  switch (classifySelfpromoPlatform(content)) {
    case "youtube": return 1;
    case "linkedin": return 2;
    case "x-instagram": return 3;
    default: return 0;
  }
}

function targetDetails(
  candidateIndex: number,
  evaluation: DualEvaluationResult,
  adjudication: AdjudicationResult,
): { label: ModerationLabel; confidence: number; reason: string } {
  for (const attempt of [evaluation.primary, evaluation.judge]) {
    if (attempt.status !== "ok") continue;
    const target = attempt.evaluation.targets.find((entry) => entry.candidateIndex === candidateIndex);
    if (target) {
      return {
        label: target.label,
        confidence: attempt.evaluation.confidence,
        reason: attempt.evaluation.reason,
      };
    }
  }
  return {
    label: adjudication.targets.find((target) => target.candidateIndex === candidateIndex)?.label ?? "malicious",
    confidence: 0,
    reason: adjudication.reason,
  };
}

function toFlaggedCandidate(
  candidate: ModerationCandidate,
  message: Message,
  details: ReturnType<typeof targetDetails>,
): FlaggedCandidate {
  return {
    message,
    verdict: details.label === "selfpromo" ? 2 : 1,
    confidence: details.confidence,
    platform: details.label === "selfpromo" ? platformNumber(candidate.content) : 0,
    reason: details.reason,
    fromImage: candidate.content === "(image)",
  };
}

async function sendPersistenceFailureAlert(
  report: Message,
  t: ReturnType<typeof getTranslation>,
  evidence: ReportEvidence,
  evaluation: DualEvaluationResult,
): Promise<void> {
  const detected = firstViolation([evaluation.primary, evaluation.judge]);
  if (!detected) return;
  const candidate = evidence.candidates.find((item) => item.index === detected.target.candidateIndex);
  const targetMessage = candidate ? evidence.messagesByIndex.get(candidate.index) : undefined;
  if (!candidate || !targetMessage) return;
  await sendFlaggedAlert(
    report,
    report.guild!.id,
    t,
    toFlaggedCandidate(candidate, targetMessage, {
      label: detected.target.label,
      confidence: detected.attempt.evaluation.confidence,
      reason: "Persistencia falló; no se aplicó ninguna acción",
    }),
    t.aiMod.action_alert_only,
    0,
    false,
  );
}

async function prepareAdjudication(
  message: Message,
  guildId: string,
  mode: ModerationMode,
  evidence: ReportEvidence,
  t: ReturnType<typeof getTranslation>,
): Promise<PreparedAdjudication | null> {
  const correctionContext = await ModerationReviewService.listCorrectionContext(guildId, "ai-mod");
  const prompts = buildAiModPrompts(correctionContext);
  const evaluation = await evaluateDual({
    candidates: evidence.candidates,
    policy: AI_MOD_POLICY,
    primarySystemPrompt: prompts.primary,
    judgeSystemPrompt: prompts.judge,
    userPrompt: buildAiModUserPrompt(evidence.reportContent, evidence.candidates),
  });
  const adjudication = adjudicate({
    primary: evaluation.primary,
    judge: evaluation.judge,
    policy: AI_MOD_POLICY,
  });

  try {
    const persisted = await ModerationRunsService.create({
      guildId,
      feature: "ai-mod",
      mode,
      triggerMessageId: message.id,
      reporterId: message.author.id,
      reportContent: evidence.reportContent,
      candidates: evidence.candidates,
      evaluation,
      adjudication,
    });
    return {
      evaluation,
      adjudication,
      runId: persisted.runId,
      targetIdsByCandidate: persisted.targetIdsByCandidate,
    };
  } catch (error) {
    logger.warn(`ai-mod: failed to persist moderation run: ${error}`);
    await sendPersistenceFailureAlert(message, t, evidence, evaluation);
    return null;
  }
}

async function createReviewCases(
  message: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
  evidence: ReportEvidence,
  prepared: PreparedAdjudication,
): Promise<void> {
  for (const candidate of evidence.candidates) {
    const targetMessage = evidence.messagesByIndex.get(candidate.index);
    const targetId = prepared.targetIdsByCandidate.get(candidate.index);
    if (!targetMessage || targetId === undefined) continue;
    const details = targetDetails(candidate.index, prepared.evaluation, prepared.adjudication);
    const caseId = await CasesService.insert({
      moderationTargetId: targetId,
      guildId,
      authorId: targetMessage.author.id,
      channelId: targetMessage.channelId,
      messageId: targetMessage.id,
      content: targetMessage.content || "(image)",
      verdict: details.label === "selfpromo" ? 2 : 1,
      confidence: details.confidence,
      platform: details.label === "selfpromo" ? platformNumber(candidate.content) : 0,
      reason: details.reason,
      actionTaken: t.aiMod.action_alert_only,
      resolved: false,
      resolvedBy: null,
      resolvedAction: null,
    });
    await ModerationRunsService.setTargetAction(targetId, "review", "pending");
    await sendRichReviewAlert({
      report: message,
      guildId,
      t,
      reportContent: evidence.reportContent,
      candidate,
      targetMessage,
      targetId,
      primary: prepared.evaluation.primary,
      judge: prepared.evaluation.judge,
      caseId,
    });
  }
}

async function sendRichReviewAlert(input: {
  report: Message;
  guildId: string;
  t: ReturnType<typeof getTranslation>;
  reportContent: string;
  candidate: ModerationCandidate;
  targetMessage: Message;
  targetId: number;
  primary: DualEvaluationResult["primary"];
  judge: DualEvaluationResult["judge"];
  caseId: number;
}): Promise<void> {
  const logChannelId = await LogChannelService.getLogChannel(input.guildId);
  if (!logChannelId) {
    logger.warn(`ai-mod: review target ${input.targetId} but no log channel`);
    return;
  }
  const channel = await input.report.guild?.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  let files: AttachmentPayload[] = [];
  try {
    files = await prepareEvidenceFiles(input.candidate.attachments);
  } catch (error) {
    logger.warn(`ai-mod: failed to prepare review evidence: ${error}`);
  }
  const targets = await NotifyTargetsService.list(input.guildId);
  const { embed, components } = buildReviewCard(
    {
      targetId: input.targetId,
      caseRef: `ai-mod:${input.caseId}`,
      feature: "ai-mod",
      content: input.targetMessage.content || "(image)",
      reportContent: input.reportContent,
      attachments: input.candidate.attachments,
      primary: input.primary,
      judge: input.judge,
      actionLabel: input.t.aiMod.action_alert_only,
      pending: true,
    },
    input.t,
  );
  await (channel as TextChannel).send({
    content: buildPingString(targets) || undefined,
    embeds: [embed],
    components,
    files,
  });
}

export async function handleModMention(message: Message): Promise<void> {
  try {
    if (!message.guild) return;
    const guildId = message.guild.id;
    if (message.author.bot) return;

    // If the reporter already has ManageMessages, they can handle it themselves.
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const parentId = "parentId" in message.channel
      ? (message.channel.parentId ?? null)
      : null;
    if (await isIgnored(guildId, { id: message.channelId, parentId })) return;

    if (!env.AI_API_URL || !env.AI_API_KEY) {
      logger.warn("ai-mod: AI env missing, feature disabled");
      return;
    }

    const enabled = await AiModConfigService.isEnabled(guildId);
    if (!enabled) return;

    // Mod-role trigger: any mentioned role registered as a mod role.
    const mentionedRoleIds = [...message.mentions.roles.keys()];
    if (mentionedRoleIds.length === 0) return;
    const isModMention = await Promise.all(
      mentionedRoleIds.map((rid) => ModRoleService.hasRole(guildId, rid)),
    );
    if (!isModMention.some(Boolean)) return;

    const lang = await LanguageService.getLanguage(guildId);
    const t = getTranslation(lang);

    const mode = await ModerationConfigService.getMode(guildId, "ai-mod");
    const evidence = await collectReportEvidence(message);
    if (evidence.candidates.length === 0) return;

    const prepared = await prepareAdjudication(message, guildId, mode, evidence, t);
    if (!prepared) return;

    if (mode !== "shadow") {
      const effectiveKind =
        mode === "assisted" && prepared.adjudication.kind === "temporary_action"
          ? "review"
          : prepared.adjudication.kind;
      if (effectiveKind === "auto_violation" || effectiveKind === "temporary_action") {
        await enforceAiModDecision({
          report: message,
          runId: prepared.runId,
          targetIdsByCandidate: prepared.targetIdsByCandidate,
          messagesByIndex: evidence.messagesByIndex,
          adjudication: effectiveKind === prepared.adjudication.kind
            ? prepared.adjudication
            : { ...prepared.adjudication, kind: "review" },
          evaluations: prepared.evaluation,
        });
      } else if (effectiveKind === "review") {
        await createReviewCases(message, guildId, t, evidence, prepared);
      }
      return;
    }

    const candidates = [...evidence.messagesByIndex.values()];

    const textCandidates: { index: number; content: string; message: Message }[] = [];
    const imageCandidates: Message[] = [];
    for (const m of candidates) {
      const content = extractPuffContent(m);
      if (!content) continue;
      if (content.kind === "image") {
        imageCandidates.push(m);
      } else if (content.kind === "text" && content.text) {
        textCandidates.push({ index: textCandidates.length, content: content.text, message: m });
      }
    }

    const flagged: FlaggedCandidate[] = [];
    const precautionCandidates: PrecautionCandidate[] = [];

    // Text route: one AI call.
    if (textCandidates.length > 0) {
      const context = await ContextBuilderService.buildContext(guildId);
      const result = await classifyBatch(
        guildId,
        textCandidates.map((c) => ({ index: c.index, content: c.content })),
        lang,
        context,
      );
      if (!result.ok) {
        logger.warn(`ai-mod: classification failed for report ${message.id}; no action taken`);
        return;
      } else {
        for (const entry of result.entries) {
          if (entry.v === 0) continue;
          if (entry.c < ALERT_THRESHOLD) continue;
          const matched = textCandidates.find((c) => c.index === entry.index);
          if (!matched) continue;
          flagged.push({
            message: matched.message,
            verdict: entry.v as 1 | 2,
            confidence: entry.c,
            platform: entry.p,
            reason: entry.r,
            fromImage: false,
          });
        }
      }
    }

    // Image route: novel images (known DB hashes are monitorImages' job).
    // Always act; sweep cross-channel only when ≥3 channels flagged.
    for (const imgMsg of imageCandidates) {
      const dup = await ImageDuplicateService.checkImage(message.guild, imgMsg);
      flagged.push({
        message: imgMsg,
        verdict: 1,
        confidence: dup.flagged ? 1 : 0.5,
        platform: 0,
        reason: dup.flagged
          ? dup.reason || t.aiMod.reason_image_spread
          : t.aiMod.reason_image_no_spread,
        fromImage: true,
        crossChannelMessages: dup.flagged ? dup.matchedMessages : undefined,
      });
    }

    // Apply bypass; any remaining flag is actionable (no alert-only band).
    const actionable: FlaggedCandidate[] = [];
    for (const f of flagged) {
      if (f.verdict === 2 && BYPASS_PLATFORMS.has(f.platform)) {
        const inBypass = await SelfpromoBypassService.isBypass(guildId, f.message.channelId);
        if (inBypass) continue; // allowed self-promo: no log, no action
      }
      actionable.push(f);
    }

    // Group actionable candidates by author so the same user gets one alert + one
    // case row per call (and cross-channel matches are all swept together).
    const buckets = new Map<string, FlaggedCandidate[]>();
    for (const f of actionable) {
      const list = buckets.get(f.message.author.id) ?? [];
      list.push(f);
      buckets.set(f.message.author.id, list);
    }

    for (const [authorId, bucket] of buckets) {
      const primary = bucket[0];
      const crossChannel: Message[] = [];
      for (const f of bucket) {
        if (f.crossChannelMessages) crossChannel.push(...f.crossChannelMessages);
      }

      await sweepCrossChannelMessages(message.guild, crossChannel);

      let actionLabel = t.aiMod.action_timeout;
      try {
        const member = await message.guild.members.fetch(authorId).catch(() => null);
        if (member) {
          if (member.isCommunicationDisabled()) {
            actionLabel = t.aiMod.action_already_timeout;
          } else {
            const ok = await safeTimeout(member, ONE_DAY_MS, `ai-mod: ${primary.reason}`);
            if (!ok) actionLabel = t.aiMod.action_no_permission;
          }
        }
      } catch (e) {
        logger.warn(`ai-mod: timeout attempt failed: ${e}`);
        actionLabel = t.aiMod.action_no_permission;
      }

      const byId = new Map<string, Message>();
      for (const m of [primary.message, ...bucket.map((f) => f.message), ...crossChannel]) {
        byId.set(m.id, m);
      }
      const toDelete = [primary.message, ...bucket.map((f) => f.message)];
      await Promise.all(toDelete.map((m) => safeDelete(m)));

      for (const f of bucket) {
        if (f.fromImage) await persistScamImage(guildId, f.message);
      }

      const cached = SanctionCache.get(guildId, authorId);
      if (cached) continue;

      const caseId = await CasesService.insert({
        guildId,
        authorId,
        channelId: primary.message.channelId,
        messageId: primary.message.id,
        content: primary.message.content || "(image)",
        verdict: primary.verdict,
        confidence: primary.confidence,
        platform: primary.platform,
        reason: primary.reason,
        actionTaken: actionLabel,
      });
      SanctionCache.set(guildId, authorId, caseId, primary.message.channelId);
      await sendFlaggedAlert(message, guildId, t, primary, actionLabel, caseId);
    }

    // Precaution alert (inconclusive + borderline), only if none actionable.
    if (precautionCandidates.length > 0 && actionable.length === 0) {
      const precautionWithCase = await Promise.all(
        precautionCandidates.map(async (pc) => {
          const caseId = await CasesService.insert({
            guildId,
            authorId: pc.message.author.id,
            channelId: pc.message.channelId,
            messageId: pc.message.id,
            content: pc.message.content || "(image)",
            verdict: pc.verdict,
            confidence: pc.confidence,
            platform: pc.platform,
            reason: pc.reason,
            actionTaken: t.aiMod.action_alert_only,
          });
          return {
            url: pc.message.url,
            authorTag: pc.message.author.tag,
            caseId,
          };
        }),
      );
      await sendPrecautionAlert(message, guildId, t, precautionWithCase);
    }
  } catch (e) {
    logger.error(`ai-mod: handleModMention error: ${e}`);
  }
}

async function persistScamImage(guildId: string, message: Message): Promise<void> {
  const urls: string[] = [];
  for (const att of message.attachments.values()) {
    if (att.contentType?.startsWith("image/")) urls.push(att.url);
  }
  urls.push(...extractImageUrls(message.content));
  for (let i = 0; i < urls.length; i++) {
    try {
      const fp = await ImageHashService.downloadFingerprint(urls[i]);
      if (!fp) continue;
      await ImageService.addImage(guildId, `aimod-${message.id}-${i}`, urls[i]);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (!reason.includes("already exists")) {
        logger.warn(`ai-mod: failed to persist scam image: ${reason}`);
      }
    }
  }
}

async function sweepCrossChannelMessages(
  guild: Guild,
  messages: Message[],
): Promise<void> {
  if (messages.length === 0) return;
  const seen = new Set<string>();
  const byChannel = new Map<string, Message[]>();
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const list = byChannel.get(m.channelId) ?? [];
    list.push(m);
    byChannel.set(m.channelId, list);
  }
  for (const [channelId, msgs] of byChannel) {
    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !("bulkDelete" in channel)) continue;
      const now = Date.now();
      const young = msgs.filter((m) => now - m.createdTimestamp < FOURTEEN_DAYS_MS);
      const old = msgs.filter((m) => now - m.createdTimestamp >= FOURTEEN_DAYS_MS);
      if (young.length > 0) {
        await (channel as unknown as { bulkDelete: (ids: string[]) => Promise<unknown> }).bulkDelete(
          young.map((m) => m.id),
        );
      }
      await Promise.all(old.map((m) => safeDelete(m)));
    } catch (e) {
      logger.warn(`ai-mod: cross-channel sweep failed for ${channelId}: ${e}`);
    }
  }
}

async function sendFlaggedAlert(
  trigger: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
  f: FlaggedCandidate,
  actionLabel: string,
  caseId: number,
  includeButtons = true,
): Promise<void> {
  const logChannelId = await LogChannelService.getLogChannel(guildId);
  if (!logChannelId) {
    logger.warn(`ai-mod: flagged case ${caseId} but no log channel`);
    return;
  }
  const channel = await trigger.guild?.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const targets = await NotifyTargetsService.list(guildId);
  const ping = buildPingString(targets);
  const { embed, components } = buildFlaggedEmbed(
    {
      caseId,
      authorTag: f.message.author.tag,
      authorId: f.message.author.id,
      channelId: f.message.channelId,
      content: f.message.content || "(imagen)",
      reportContent: trigger.content,
      confidence: f.confidence,
      platform: f.platform,
      verdict: f.verdict,
      reason: f.reason,
      actionLabel,
    },
    t,
  );
  await (channel as TextChannel).send({
    content: ping || undefined,
    embeds: [embed],
    components: includeButtons ? components : undefined,
  });
}

async function sendPrecautionAlert(
  trigger: Message,
  guildId: string,
  t: ReturnType<typeof getTranslation>,
  candidates: { url: string; authorTag: string; caseId: number }[],
): Promise<void> {
  const logChannelId = await LogChannelService.getLogChannel(guildId);
  if (!logChannelId) {
    logger.warn("ai-mod: precaution needed but no log channel");
    return;
  }
  const channel = await trigger.guild?.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const targets = await NotifyTargetsService.list(guildId);
  const ping = buildPingString(targets);
  const { embed, components } = buildPrecautionEmbed(candidates, t);
  await (channel as TextChannel).send({
    content: ping || undefined,
    embeds: [embed],
    components,
  });
}
