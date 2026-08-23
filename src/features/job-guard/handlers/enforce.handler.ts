import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
} from "discord.js";
import { env } from "@/config/env";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { classify, type ClassifyResult } from "../services/classifier.service";
import { JobGuardCasesService } from "../services/cases.service";
import { safeDelete } from "@/core/discord/moderation";
import { LogChannelService } from "@/features/log-channel";
import { logger } from "@/core/logger";
import {
  adjudicate,
  evaluateDual,
  ModerationActionCoordinator,
  ModerationConfigService,
  ModerationReviewService,
  ModerationRunsService,
} from "@/features/ai-moderation";
import type {
  AdjudicationResult,
  EvaluationAttempt,
  ModerationCandidate,
  ModerationMode,
  DualEvaluationResult,
} from "@/features/ai-moderation";
import { buildReviewCard } from "@/features/ai-moderation/services/review-card.service";
import {
  prepareEvidenceFiles,
  type AttachmentPayload,
} from "@/features/ai-moderation/services/evidence-files.service";
import {
  buildJobGuardPrompts,
  buildJobGuardUserPrompt,
  JOB_GUARD_POLICY,
} from "../services/moderation-policy.service";

const MAX_INPUT = 4000;

export function shouldAudit(random: () => number = Math.random): boolean {
  return random() < 0.05;
}

function buildCandidate(message: Message, content: string): ModerationCandidate {
  return {
    index: 0,
    messageId: message.id,
    authorId: message.author.id,
    channelId: message.channelId,
    content,
    attachments: Array.from(message.attachments.values()).map((attachment) => ({
      url: attachment.url,
      name: attachment.name,
      contentType: attachment.contentType ?? null,
    })),
  };
}

function violationResult(
  attempts: readonly EvaluationAttempt[],
): ClassifyResult | null {
  for (const attempt of attempts) {
    if (attempt.status === "ok" && attempt.evaluation.outcome === "violation") {
      return {
        ok: true,
        verdict: "block",
        confidence: attempt.evaluation.confidence,
        reason: attempt.evaluation.reason,
      };
    }
  }
  return null;
}

function resultForNotification(
  attempts: readonly EvaluationAttempt[],
  adjudication: AdjudicationResult,
): ClassifyResult {
  if (adjudication.kind === "auto_allow") {
    const confidence = attempts.find((attempt) => attempt.status === "ok")?.evaluation.confidence ?? 0;
    return {
      ok: true,
      verdict: "allow",
      confidence,
      reason: adjudication.reason,
    };
  }
  return (
    violationResult(attempts) ?? {
      ok: true,
      verdict: "block",
      confidence: 0,
      reason: adjudication.reason,
    }
  );
}

async function insertCase(
  message: Message,
  content: string,
  moderationTargetId: number,
  result: ClassifyResult,
  values: {
    deleted: boolean;
    resolved?: boolean;
    resolvedBy?: string | null;
    resolvedAction?: "auto" | null;
  },
): Promise<number> {
  return JobGuardCasesService.insert({
    moderationTargetId,
    guildId: message.guild!.id,
    authorId: message.author.id,
    channelId: message.channelId,
    messageId: message.id,
    content,
    verdict: result.verdict ?? "block",
    confidence: result.confidence ?? 0,
    reason: result.reason ?? "",
    ...values,
  });
}

async function enforceLegacy(
  message: Message,
  content: string,
): Promise<void> {
  const result = await classify(content, message.guild!.id);
  if (!result.ok || result.verdict !== "block") return;

  const shouldDelete = (result.confidence ?? 0) >= 0.8;
  const deleted = shouldDelete ? await safeDelete(message) : false;

  let caseId = 0;
  try {
    caseId = await JobGuardCasesService.insert({
      guildId: message.guild!.id,
      authorId: message.author.id,
      channelId: message.channelId,
      messageId: message.id,
      content,
      verdict: "block",
      confidence: result.confidence ?? 0,
      reason: result.reason ?? "",
      deleted,
    });
    if (caseId === 0) {
      logger.warn("job-guard: case insert returned no id");
    }
  } catch (e) {
    logger.warn(`job-guard: failed to insert case: ${e}`);
  }

  await notifyMods(message, content, result, deleted, caseId);
}

async function enforceAdjudicated(
  message: Message,
  content: string,
  runId: number,
  mode: ModerationMode,
  candidates: ModerationCandidate[],
  evaluation: Awaited<ReturnType<typeof evaluateDual>>,
  adjudication: AdjudicationResult,
  targetIdsByCandidate: Map<number, number>,
): Promise<void> {
  if (mode === "shadow") {
    await enforceLegacy(message, content);
    return;
  }

  const effectiveKind =
    mode === "assisted" && adjudication.kind === "temporary_action"
      ? "review"
      : adjudication.kind;
  const notificationResult = resultForNotification(
    [evaluation.primary, evaluation.judge],
    adjudication,
  );

  if (effectiveKind === "auto_violation") {
    const targetIndex = adjudication.targets[0]?.candidateIndex ?? 0;
    const targetId = targetIdsByCandidate.get(targetIndex);
    if (targetId === undefined) {
      logger.warn(`job-guard: missing persisted target ${targetIndex}`);
      return;
    }

    const action = await ModerationActionCoordinator.delete(
      {
        runId,
        targetId,
        guildId: message.guild!.id,
        messageId: candidates.find((candidate) => candidate.index === targetIndex)?.messageId ?? message.id,
      },
      () => safeDelete(message),
    );
    await ModerationRunsService.setTargetAction(targetId, "delete", action.status);

    const deleted = action.status === "succeeded";
    let caseId = 0;
    try {
      caseId = await insertCase(message, content, targetId, notificationResult, {
        deleted,
        resolved: deleted,
        resolvedBy: deleted ? "system" : null,
        resolvedAction: deleted ? "auto" : null,
      });
    } catch (error) {
      logger.warn(`job-guard: failed to insert adjudicated case: ${error}`);
    }
    await notifyMods(message, content, notificationResult, deleted, caseId, !deleted);
    return;
  }

  if (effectiveKind === "auto_allow" && !shouldAudit()) return;
  if (effectiveKind === "technical_error") {
    const candidate = candidates[0];
    const targetId = targetIdsByCandidate.get(0);
    if (candidate && targetId !== undefined) {
      let files: AttachmentPayload[] = [];
      try {
        files = await prepareEvidenceFiles(candidate.attachments);
      } catch (error) {
        logger.warn(`job-guard: failed to prepare evidence files: ${error}`);
      }
      await notifyMods(message, content, notificationResult, false, 0, false, {
        targetId,
        evaluation,
        attachments: candidate.attachments,
        files,
      });
    } else {
      await notifyMods(message, content, notificationResult, false, 0, false);
    }
    return;
  }

  const targetId = targetIdsByCandidate.get(0);
  if (targetId === undefined) {
    logger.warn("job-guard: no target available for review");
    return;
  }

  let caseId = 0;
  try {
    caseId = await insertCase(message, content, targetId, notificationResult, {
      deleted: false,
      resolved: false,
      resolvedBy: null,
      resolvedAction: null,
    });
    await ModerationRunsService.setTargetAction(targetId, "review", "pending");
  } catch (error) {
    logger.warn(`job-guard: failed to insert adjudicated review case: ${error}`);
  }
  let files: AttachmentPayload[] = [];
  try {
    files = await prepareEvidenceFiles(candidates[0]?.attachments ?? []);
  } catch (error) {
    logger.warn(`job-guard: failed to prepare evidence files: ${error}`);
  }
  await notifyMods(message, content, notificationResult, false, caseId, false, {
    targetId,
    evaluation,
    attachments: candidates[0]?.attachments ?? [],
    files,
  });
}

export async function enforceJobGuard(message: Message): Promise<void> {
  if (!env.JOB_CHANNEL_ID || !env.AI_API_URL || !env.AI_API_KEY) return;
  if (message.channelId !== env.JOB_CHANNEL_ID) return;
  if (!message.guild) return;

  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const content = message.content?.trim();
  if (!content) return;

  const boundedContent = content.slice(0, MAX_INPUT);
  const mode = await ModerationConfigService.getMode(message.guild.id, "job-guard");
  const correctionContext = await ModerationReviewService.listCorrectionContext(
    message.guild.id,
    "job-guard",
  );
  const candidates = [buildCandidate(message, boundedContent)];
  const prompts = buildJobGuardPrompts(correctionContext);
  const evaluation = await evaluateDual({
    candidates,
    policy: JOB_GUARD_POLICY,
    primarySystemPrompt: prompts.primary,
    judgeSystemPrompt: prompts.judge,
    userPrompt: buildJobGuardUserPrompt("", candidates),
  });
  const adjudication = adjudicate({
    primary: evaluation.primary,
    judge: evaluation.judge,
    policy: JOB_GUARD_POLICY,
  });

  let persisted: Awaited<ReturnType<typeof ModerationRunsService.create>>;
  try {
    persisted = await ModerationRunsService.create({
      guildId: message.guild.id,
      feature: "job-guard",
      mode,
      triggerMessageId: message.id,
      reporterId: null,
      reportContent: null,
      candidates,
      evaluation,
      adjudication,
    });
  } catch (error) {
    logger.warn(`job-guard: failed to persist moderation run: ${error}`);
    const detected = violationResult([evaluation.primary, evaluation.judge]);
    if (!detected) return;
    await notifyMods(
      message,
      boundedContent,
      {
        ...detected,
        reason: "Persistencia falló; no se aplicó ninguna acción",
      },
      false,
      0,
      false,
    );
    return;
  }

  await enforceAdjudicated(
    message,
    boundedContent,
    persisted.runId,
    mode,
    candidates,
    evaluation,
    adjudication,
    persisted.targetIdsByCandidate,
  );
}

async function notifyMods(
  message: Message,
  originalText: string,
  result: ClassifyResult,
  deleted: boolean,
  caseId: number,
  includeButtons = true,
  rich?: {
    targetId: number;
    evaluation: DualEvaluationResult;
    attachments: ModerationCandidate["attachments"];
    files: AttachmentPayload[];
  },
): Promise<void> {
  try {
    const guildId = message.guild!.id;
    const logChannelId = await LogChannelService.getLogChannel(guildId);
    if (!logChannelId) {
      logger.warn(
        `job-guard: block (deleted=${deleted}) but no log channel; author=${message.author.id}`,
      );
      return;
    }

    const logChannel = await message.guild!.channels.fetch(logChannelId);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

    if (rich) {
      const lang = await LanguageService.getLanguage(guildId);
      const t = getTranslation(lang);
      const { embed, components } = buildReviewCard(
        {
          targetId: rich.targetId,
          caseRef: `job-guard:${caseId > 0 ? caseId : `target-${rich.targetId}`}`,
          feature: "job-guard",
          content: originalText,
          reportContent: null,
          attachments: rich.attachments,
          primary: rich.evaluation.primary,
          judge: rich.evaluation.judge,
          actionLabel: deleted ? "Message deleted" : "Review required",
          pending: true,
        },
        t,
      );
      await logChannel.send({
        embeds: [embed],
        components,
        files: rich.files,
      });
      return;
    }

    // ponytail: alerta en español hardcoded; i18n si algún día hace falta.
    const embed = new EmbedBuilder()
      .setColor(deleted ? 0xff4d4d : 0xffaa00)
      .setTitle(
        deleted ? "🚫 Oferta de empleo eliminada" : "⚠️ Posible oferta de empleo",
      )
      .setDescription(originalText.slice(0, 1024))
      .addFields(
        {
          name: "Autor",
          value: `${message.author.username} (${message.author.id})`,
          inline: true,
        },
        { name: "Canal", value: `<#${message.channelId}>`, inline: true },
        {
          name: "Confianza",
          value: `${Math.round((result.confidence ?? 0) * 100)}%`,
          inline: true,
        },
        { name: "Razón AI", value: (result.reason || "—").slice(0, 1024) },
        {
          name: "Acción",
          value: deleted ? "Mensaje eliminado" : "No eliminado (revisar)",
        },
      )
      .setTimestamp();

    const embedWithFooter =
      caseId > 0
        ? embed.setFooter({ text: `case_id: ${caseId}` })
        : embed;

    const sendPayload: {
      embeds: ReturnType<EmbedBuilder["setTimestamp"]>[];
      components?: ActionRowBuilder<ButtonBuilder>[];
    } = { embeds: [embedWithFooter] };

    if (caseId > 0 && includeButtons) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`jobguard_${caseId}_correct`)
          .setLabel("Correcto")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`jobguard_${caseId}_incorrect`)
          .setLabel("Incorrecto")
          .setStyle(ButtonStyle.Danger),
      );
      sendPayload.components = [row];
    }

    await logChannel.send(sendPayload);
  } catch (e) {
    logger.warn(`job-guard: failed to notify mods: ${e}`);
  }
}
