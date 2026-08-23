import { env } from "@/config/env";
import {
  AIClientService,
  type AIGenerationAttempt,
  type AIGenerationResult,
  type ChatTurn,
} from "@/features/ai-mod/services/ai-client.service";
import type {
  EvaluationAttempt,
  ModerationCandidate,
  ModerationPolicy,
} from "../types";
import { parseModelEvaluation } from "./output-parser.service";

export interface DualEvaluationInput {
  candidates: ModerationCandidate[];
  policy: ModerationPolicy;
  primarySystemPrompt: string;
  judgeSystemPrompt: string;
  userPrompt: string;
}

export interface DualEvaluationResult {
  primary: EvaluationAttempt;
  judge: EvaluationAttempt;
  primaryGeneration: AIGenerationResult | null;
  judgeGeneration: AIGenerationResult | null;
}

let evaluationQueue: Promise<void> = Promise.resolve();

function parseAttempt(
  attempt: AIGenerationAttempt,
  policy: ModerationPolicy,
  candidates: readonly ModerationCandidate[],
): EvaluationAttempt {
  if (attempt.status !== "ok") {
    return { status: attempt.status, error: attempt.error };
  }
  return parseModelEvaluation(attempt.result.text, policy, candidates);
}

function normalizeSettledAttempt(
  settled: PromiseSettledResult<AIGenerationAttempt>,
): AIGenerationAttempt {
  if (settled.status === "fulfilled") return settled.value;
  return {
    status: "provider_error",
    error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
  };
}

async function runEvaluation(input: DualEvaluationInput): Promise<DualEvaluationResult> {
  const messages: ChatTurn[] = [{ role: "user", content: input.userPrompt }];
  const options = {
    model: env.AI_MODEL,
    temperature: 0,
    timeoutMs: 180_000,
  };
  const [primarySettled, judgeSettled] = await Promise.allSettled([
    AIClientService.chatMessagesAttempt(input.primarySystemPrompt, messages, options),
    AIClientService.chatMessagesAttempt(input.judgeSystemPrompt, messages, options),
  ]);
  const primaryAttempt = normalizeSettledAttempt(primarySettled);
  const judgeAttempt = normalizeSettledAttempt(judgeSettled);

  return {
    primary: parseAttempt(primaryAttempt, input.policy, input.candidates),
    judge: parseAttempt(judgeAttempt, input.policy, input.candidates),
    primaryGeneration: primaryAttempt.status === "ok" ? primaryAttempt.result : null,
    judgeGeneration: judgeAttempt.status === "ok" ? judgeAttempt.result : null,
  };
}

export function evaluateDual(input: DualEvaluationInput): Promise<DualEvaluationResult> {
  const result = evaluationQueue.then(
    () => runEvaluation(input),
    () => runEvaluation(input),
  );
  evaluationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
