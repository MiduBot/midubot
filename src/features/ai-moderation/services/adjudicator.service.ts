import type {
  AdjudicationResult,
  AdjudicatedTarget,
  EvaluationAttempt,
  ModerationPolicy,
} from "../types";

export interface AdjudicationInput {
  primary: EvaluationAttempt;
  judge: EvaluationAttempt;
  policy: ModerationPolicy;
}

function violationTargets(attempt: EvaluationAttempt): AdjudicatedTarget[] | null {
  if (
    attempt.status !== "ok" ||
    attempt.evaluation.outcome !== "violation" ||
    attempt.evaluation.targets.length === 0
  ) {
    return null;
  }

  return attempt.evaluation.targets
    .map(({ candidateIndex, label }) => ({ candidateIndex, label }))
    .sort((left, right) => {
      const indexDifference = left.candidateIndex - right.candidateIndex;
      if (indexDifference !== 0) return indexDifference;
      if (left.label === right.label) return 0;
      return left.label < right.label ? -1 : 1;
    });
}

function sameTargets(
  primary: readonly AdjudicatedTarget[],
  judge: readonly AdjudicatedTarget[],
): boolean {
  return (
    primary.length === judge.length &&
    primary.every(
      (target, index) =>
        target.candidateIndex === judge[index]?.candidateIndex &&
        target.label === judge[index]?.label,
    )
  );
}

function isAllowAbstainOrFailure(attempt: EvaluationAttempt): boolean {
  return (
    attempt.status !== "ok" ||
    attempt.evaluation.outcome === "allow" ||
    attempt.evaluation.outcome === "abstain"
  );
}

function review(reason: "target_conflict" | "insufficient_agreement"): AdjudicationResult {
  return { kind: "review", targets: [], reason };
}

export function adjudicate(input: AdjudicationInput): AdjudicationResult {
  const { primary, judge, policy } = input;

  if (primary.status !== "ok" && judge.status !== "ok") {
    return { kind: "technical_error", targets: [], reason: "technical_error" };
  }

  if (
    primary.status === "ok" &&
    judge.status === "ok" &&
    primary.evaluation.outcome === "allow" &&
    judge.evaluation.outcome === "allow"
  ) {
    if (
      primary.evaluation.confidence >= policy.allowThreshold &&
      judge.evaluation.confidence >= policy.allowThreshold
    ) {
      return { kind: "auto_allow", targets: [], reason: "agreement_allow" };
    }
    return review("insufficient_agreement");
  }

  const primaryTargets = violationTargets(primary);
  const judgeTargets = violationTargets(judge);

  if (primaryTargets && judgeTargets) {
    if (!sameTargets(primaryTargets, judgeTargets)) {
      return review("target_conflict");
    }

    if (
      primary.status === "ok" &&
      judge.status === "ok" &&
      primary.evaluation.confidence >= policy.violationThreshold &&
      judge.evaluation.confidence >= policy.violationThreshold
    ) {
      return {
        kind: "auto_violation",
        targets: primaryTargets,
        reason: "agreement_violation",
      };
    }

    if (
      primary.status === "ok" &&
      judge.status === "ok" &&
      policy.temporaryActionEnabled &&
      primary.evaluation.confidence >= policy.temporaryThreshold &&
      judge.evaluation.confidence >= policy.temporaryThreshold
    ) {
      return {
        kind: "temporary_action",
        targets: primaryTargets,
        reason: "temporary_agreement",
      };
    }

    return review("insufficient_agreement");
  }

  if (policy.temporaryActionEnabled) {
    const strongPrimary =
      primaryTargets?.length === 1 &&
      primary.status === "ok" &&
      primary.evaluation.confidence >= policy.violationThreshold &&
      isAllowAbstainOrFailure(judge);
    if (strongPrimary) {
      return {
        kind: "temporary_action",
        targets: primaryTargets,
        reason: "single_strong_signal",
      };
    }

    const strongJudge =
      judgeTargets?.length === 1 &&
      judge.status === "ok" &&
      judge.evaluation.confidence >= policy.violationThreshold &&
      isAllowAbstainOrFailure(primary);
    if (strongJudge) {
      return {
        kind: "temporary_action",
        targets: judgeTargets,
        reason: "single_strong_signal",
      };
    }
  }

  return { kind: "review", targets: [], reason: "insufficient_agreement" };
}
