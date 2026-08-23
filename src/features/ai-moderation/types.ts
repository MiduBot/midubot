export type ModerationFeature = "ai-mod" | "job-guard";
export type ModerationMode = "shadow" | "assisted" | "autonomous";
export type ModerationLabel = "job_offer" | "malicious" | "selfpromo";
export type EvaluationStatus = "ok" | "timeout" | "invalid_output" | "provider_error";

export interface ModerationCandidate {
  index: number;
  messageId: string;
  authorId: string;
  channelId: string;
  content: string;
  attachments: Array<{
    url: string;
    name: string;
    contentType: string | null;
    hash?: string;
  }>;
}

export interface EvidenceQuote {
  quote: string;
  policyTag: string;
}

export interface EvaluationTarget {
  candidateIndex: number;
  label: ModerationLabel;
  evidence: EvidenceQuote[];
}

export interface ModelEvaluation {
  outcome: "allow" | "violation" | "abstain";
  confidence: number;
  targets: EvaluationTarget[];
  reason: string;
}

export type EvaluationAttempt =
  | { status: "ok"; evaluation: ModelEvaluation }
  | { status: Exclude<EvaluationStatus, "ok">; error?: string };

export interface ModerationPolicy {
  feature: ModerationFeature;
  allowedLabels: readonly ModerationLabel[];
  violationThreshold: number;
  temporaryThreshold: number;
  allowThreshold: number;
  temporaryActionEnabled: boolean;
  primaryPromptVersion: string;
  judgePromptVersion: string;
}

export type AdjudicationKind =
  | "auto_violation"
  | "auto_allow"
  | "temporary_action"
  | "review"
  | "technical_error";

export interface AdjudicatedTarget {
  candidateIndex: number;
  label: ModerationLabel;
}

export interface AdjudicationResult {
  kind: AdjudicationKind;
  targets: AdjudicatedTarget[];
  reason: string;
}
