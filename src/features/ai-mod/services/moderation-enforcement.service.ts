import type { GuildMember, Message } from "discord.js";
import { safeDelete, safeTimeout } from "@/core/discord/moderation";
import {
  ModerationActionCoordinator,
  ModerationRunsService,
} from "@/features/ai-moderation";
import type {
  AdjudicationResult,
  DualEvaluationResult,
  ModerationLabel,
} from "@/features/ai-moderation";
import { CasesService } from "./cases.service";
import { SelfpromoBypassService } from "./selfpromo-bypass.service";
import { classifySelfpromoPlatform } from "./selfpromo-platform.service";

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
): Promise<void> {
  await CasesService.insert({
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
      const resolved = deletion.status === "succeeded";
      await insertCase(
        input,
        target,
        actionTaken,
        resolved,
        resolved ? "auto" : null,
      );
    }),
  );
}
