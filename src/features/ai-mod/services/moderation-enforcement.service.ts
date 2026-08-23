import {
  ChannelType,
  type GuildMember,
  type Message,
  type TextChannel,
} from "discord.js";
import { safeDelete, safeTimeout } from "@/core/discord/moderation";
import { logger } from "@/core/logger";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { LogChannelService } from "@/features/log-channel";
import {
  ModerationActionCoordinator,
  ModerationRunsService,
} from "@/features/ai-moderation";
import type {
  AdjudicationResult,
  DualEvaluationResult,
  ModerationCandidate,
  ModerationLabel,
} from "@/features/ai-moderation";
import { buildPingString } from "./alert-builder.service";
import { NotifyTargetsService } from "./notify-targets.service";
import { CasesService } from "./cases.service";
import { SelfpromoBypassService } from "./selfpromo-bypass.service";
import { classifySelfpromoPlatform } from "./selfpromo-platform.service";
import { prepareEvidenceFiles, type AttachmentPayload } from "@/features/ai-moderation/services/evidence-files.service";
import { buildReviewCard } from "@/features/ai-moderation/services/review-card.service";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export interface AiModEnforcementInput {
  report: Message;
  runId: number;
  targetIdsByCandidate: Map<number, number>;
  messagesByIndex: Map<number, Message>;
  adjudication: AdjudicationResult;
  evaluations: DualEvaluationResult;
}

interface ActiveTarget {
  candidateIndex: number;
  targetId: number;
  label: ModerationLabel;
  message: Message;
}

function verdictForLabel(label: ModerationLabel): number {
  return label === "selfpromo" ? 2 : 1;
}

function confidenceForTarget(
  evaluations: DualEvaluationResult,
  candidateIndex: number,
): number {
  const confidences = [evaluations.primary, evaluations.judge]
    .filter((attempt): attempt is Extract<typeof attempt, { status: "ok" }> => attempt.status === "ok")
    .filter((attempt) => attempt.evaluation.targets.some((target) => target.candidateIndex === candidateIndex))
    .map((attempt) => attempt.evaluation.confidence);
  return Math.max(...confidences, 0);
}

function reasonForEvaluation(evaluations: DualEvaluationResult): string {
  for (const attempt of [evaluations.primary, evaluations.judge]) {
    if (attempt.status === "ok") return attempt.evaluation.reason;
  }
  return "";
}

async function findMember(report: Message, target: Message): Promise<GuildMember | null> {
  if (target.member) return target.member;
  return (await report.guild?.members.fetch(target.author.id).catch(() => null)) ?? null;
}

async function insertCase(
  input: AiModEnforcementInput,
  target: ActiveTarget,
  actionTaken: string,
  resolved: boolean,
  resolvedAction: string | null,
): Promise<number> {
  return CasesService.insert({
    moderationTargetId: target.targetId,
    guildId: input.report.guild!.id,
    authorId: target.message.author.id,
    channelId: target.message.channelId,
    messageId: target.message.id,
    content: target.message.content || "(image)",
    verdict: verdictForLabel(target.label),
    confidence: confidenceForTarget(input.evaluations, target.candidateIndex),
    platform: target.label === "selfpromo" ? 2 : 0,
    reason: reasonForEvaluation(input.evaluations),
    actionTaken,
    resolved,
    resolvedBy: resolved ? "system" : null,
    resolvedAction,
  });
}

function attachmentsForMessage(message: Message): ModerationCandidate["attachments"] {
  return Array.from(message.attachments.values()).map((attachment) => ({
    url: attachment.url,
    name: attachment.name ?? "attachment",
    contentType: attachment.contentType ?? null,
  }));
}

async function sendRichReviewAlert(input: {
  report: Message;
  target: ActiveTarget;
  evaluations: DualEvaluationResult;
  actionLabel: string;
  caseId: number;
  files: AttachmentPayload[];
}): Promise<void> {
  try {
    const guild = input.report.guild;
    if (!guild) return;
    const logChannelId = await LogChannelService.getLogChannel(guild.id);
    if (!logChannelId) return;
    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

    const lang = await LanguageService.getLanguage(guild.id);
    const t = getTranslation(lang);
    const notifyTargets = await NotifyTargetsService.list(guild.id);
    const attachments = attachmentsForMessage(input.target.message);
    const { embed, components } = buildReviewCard(
      {
        targetId: input.target.targetId,
        caseRef: `ai-mod:${input.caseId > 0 ? input.caseId : `target-${input.target.targetId}`}`,
        feature: "ai-mod",
        content: input.target.message.content || "(image)",
        reportContent: input.report.content || null,
        attachments,
        primary: input.evaluations.primary,
        judge: input.evaluations.judge,
        actionLabel: input.actionLabel,
        pending: true,
      },
      t,
    );
    await (logChannel as TextChannel).send({
      content: buildPingString(notifyTargets) || undefined,
      embeds: [embed],
      components,
      files: input.files,
    });
  } catch (error) {
    logger.warn(`ai-mod: failed to send rich review card: ${error}`);
  }
}

export async function enforceAiModDecision(input: AiModEnforcementInput): Promise<void> {
  if (input.adjudication.kind !== "auto_violation" && input.adjudication.kind !== "temporary_action") {
    return;
  }

  const durationMs = input.adjudication.kind === "temporary_action" ? ONE_HOUR_MS : ONE_DAY_MS;
  const activeTargets: ActiveTarget[] = [];
  for (const adjudicatedTarget of input.adjudication.targets) {
    const message = input.messagesByIndex.get(adjudicatedTarget.candidateIndex);
    const targetId = input.targetIdsByCandidate.get(adjudicatedTarget.candidateIndex);
    if (!message || targetId === undefined) continue;

    const activeTarget = {
      candidateIndex: adjudicatedTarget.candidateIndex,
      targetId,
      label: adjudicatedTarget.label,
      message,
    };
    if (
      adjudicatedTarget.label === "selfpromo" &&
      classifySelfpromoPlatform(message.content) !== "other" &&
      await SelfpromoBypassService.isBypass(input.report.guild!.id, message.channelId)
    ) {
      await ModerationRunsService.setTargetAction(targetId, "bypass", "succeeded");
      await insertCase(input, activeTarget, "bypass", true, "bypass");
      continue;
    }
    activeTargets.push(activeTarget);
  }

  const evidenceFiles = new Map<number, AttachmentPayload[]>();
  await Promise.all(activeTargets.map(async (target) => {
    try {
      evidenceFiles.set(
        target.targetId,
        await prepareEvidenceFiles(attachmentsForMessage(target.message)),
      );
    } catch (error) {
      logger.warn(`ai-mod: failed to prepare evidence files: ${error}`);
      evidenceFiles.set(target.targetId, []);
    }
  }));

  const timeoutResults = new Map<string, "succeeded" | "failed" | "pending">();
  const timeoutTargets = new Map<string, ActiveTarget>();
  for (const target of activeTargets) {
    timeoutTargets.set(target.message.author.id, timeoutTargets.get(target.message.author.id) ?? target);
  }
  await Promise.all(
    [...timeoutTargets].map(async ([authorId, target]) => {
      const member = await findMember(input.report, target.message);
      if (!member) return;
      const result = await ModerationActionCoordinator.timeout(
        {
          runId: input.runId,
          targetId: target.targetId,
          guildId: input.report.guild!.id,
          authorId,
          durationMs,
        },
        () => safeTimeout(member, durationMs, `ai-mod: ${input.adjudication.reason}`),
      );
      timeoutResults.set(authorId, result.status);
    }),
  );

  await Promise.all(
    activeTargets.map(async (target) => {
      const deletion = await ModerationActionCoordinator.delete(
        {
          runId: input.runId,
          targetId: target.targetId,
          guildId: input.report.guild!.id,
          messageId: target.message.id,
        },
        () => safeDelete(target.message),
      );
      await ModerationRunsService.setTargetAction(target.targetId, "delete", deletion.status);
      const timeoutStatus = timeoutResults.get(target.message.author.id);
      const actionTaken = timeoutStatus === "succeeded" ? "delete+timeout" : "delete";
      const resolved =
        deletion.status === "succeeded" && input.adjudication.kind === "auto_violation";
      const caseId = await insertCase(
        input,
        target,
        actionTaken,
        resolved,
        resolved ? "auto" : null,
      );
      if (input.adjudication.kind === "temporary_action") {
        await ModerationRunsService.setTargetAction(target.targetId, "review", "pending");
        await sendRichReviewAlert({
          report: input.report,
          target,
          evaluations: input.evaluations,
          actionLabel: `${actionTaken} (1h)`,
          caseId,
          files: evidenceFiles.get(target.targetId) ?? [],
        });
      }
    }),
  );
}
