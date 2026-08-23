import type {
  EvaluationAttempt,
  EvaluationTarget,
  ModerationCandidate,
  ModerationPolicy,
} from "../types";

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function invalid(error: string): EvaluationAttempt {
  return { status: "invalid_output", error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function stripOptionalFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseModelEvaluation(
  raw: string,
  policy: ModerationPolicy,
  candidates: readonly ModerationCandidate[],
): EvaluationAttempt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripOptionalFence(raw));
  } catch {
    return invalid("malformed_json");
  }

  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ["outcome", "confidence", "targets", "reason"])
  ) {
    return invalid("invalid_evaluation_shape");
  }

  if (
    parsed.outcome !== "allow" &&
    parsed.outcome !== "violation" &&
    parsed.outcome !== "abstain"
  ) {
    return invalid("invalid_outcome");
  }
  if (
    typeof parsed.confidence !== "number" ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    return invalid("invalid_confidence");
  }
  if (!Array.isArray(parsed.targets)) {
    return invalid("invalid_targets");
  }
  if (typeof parsed.reason !== "string" || normalize(parsed.reason).length === 0) {
    return invalid("invalid_reason");
  }
  if (parsed.outcome === "violation" && parsed.targets.length === 0) {
    return invalid("violation_requires_targets");
  }
  if (parsed.outcome !== "violation" && parsed.targets.length > 0) {
    return invalid("non_violation_has_targets");
  }

  const targets: EvaluationTarget[] = [];
  const seenTargets = new Set<string>();

  for (const value of parsed.targets) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ["candidateIndex", "label", "evidence"]) ||
      typeof value.candidateIndex !== "number" ||
      !Number.isInteger(value.candidateIndex)
    ) {
      return invalid("invalid_target_shape");
    }

    const label = policy.allowedLabels.find((allowed) => allowed === value.label);
    if (!label) {
      return invalid("label_not_allowed");
    }

    const candidate = candidates.find(({ index }) => index === value.candidateIndex);
    if (!candidate) {
      return invalid("unknown_candidate");
    }
    if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
      return invalid("target_requires_evidence");
    }

    const targetKey = `${value.candidateIndex}:${label}`;
    if (seenTargets.has(targetKey)) {
      return invalid("duplicate_target");
    }
    seenTargets.add(targetKey);

    const evidence: EvaluationTarget["evidence"] = [];
    for (const item of value.evidence) {
      if (
        !isRecord(item) ||
        !hasExactKeys(item, ["quote", "policyTag"]) ||
        typeof item.quote !== "string" ||
        typeof item.policyTag !== "string"
      ) {
        return invalid("invalid_evidence_shape");
      }

      const quote = normalize(item.quote);
      if (
        quote.length === 0 ||
        normalize(item.policyTag).length === 0 ||
        !normalize(candidate.content).includes(quote)
      ) {
        return invalid("invalid_evidence");
      }
      evidence.push({ quote: item.quote, policyTag: item.policyTag });
    }

    targets.push({ candidateIndex: value.candidateIndex, label, evidence });
  }

  return {
    status: "ok",
    evaluation: {
      outcome: parsed.outcome,
      confidence: parsed.confidence,
      targets,
      reason: parsed.reason,
    },
  };
}
