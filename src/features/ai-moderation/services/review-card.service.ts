import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { Translations } from "@/i18n";
import type {
  EvaluationAttempt,
  ModerationCandidate,
  ModerationFeature,
} from "../types";

export interface ReviewCardInput {
  targetId: number;
  caseRef: string;
  feature: ModerationFeature;
  content: string;
  reportContent: string | null;
  attachments: ModerationCandidate["attachments"];
  primary: EvaluationAttempt;
  judge: EvaluationAttempt;
  actionLabel: string;
  pending: boolean;
}

const MAX_DESCRIPTION = 3_500;
const TRUNCATION_SUFFIX = "...[truncated]";

function neutralizeMentions(value: string): string {
  return value.replaceAll("@", "@\u200b");
}

function truncateContent(value: string): string {
  const safeValue = neutralizeMentions(value || "(no content)");
  if (safeValue.length <= MAX_DESCRIPTION) return safeValue;
  return safeValue.slice(0, MAX_DESCRIPTION - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function evaluationField(attempt: EvaluationAttempt): string {
  if (attempt.status !== "ok") {
    return `${attempt.status}: ${neutralizeMentions(attempt.error ?? "no details")}`;
  }

  const evaluation = attempt.evaluation;
  const targets = evaluation.targets.length === 0
    ? "allow"
    : evaluation.targets.map((target) => {
        const evidence = target.evidence.length === 0
          ? "no evidence"
          : target.evidence
              .map((item) => `"${neutralizeMentions(item.quote)}" [${neutralizeMentions(item.policyTag)}]`)
              .join("; ");
        return `${neutralizeMentions(target.label)}: ${evidence}`;
      }).join("\n");

  return [
    `Outcome: ${neutralizeMentions(evaluation.outcome)}`,
    `Confidence: ${percent(evaluation.confidence)}`,
    `Evidence: ${targets}`,
    `Reason: ${neutralizeMentions(evaluation.reason || "—")}`,
  ].join("\n");
}

function attachmentField(
  attachments: ModerationCandidate["attachments"],
): string {
  if (attachments.length === 0) return "—";
  return attachments
    .map((attachment) => `${neutralizeMentions(attachment.name)} - ${neutralizeMentions(attachment.url)}`)
    .join("\n")
    .slice(0, 1_024);
}

export function buildReviewCard(
  input: ReviewCardInput,
  t: Translations,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const firstImage = input.attachments.find((attachment) =>
    attachment.contentType?.startsWith("image/"),
  );
  const fields = [
    {
      name: t.aiMod.field_report,
      value: neutralizeMentions(input.reportContent || "(no report)"),
      inline: false,
    },
    {
      name: t.aiMod.review_classifier,
      value: evaluationField(input.primary).slice(0, 1_024),
      inline: false,
    },
    {
      name: t.aiMod.review_judge,
      value: evaluationField(input.judge).slice(0, 1_024),
      inline: false,
    },
    {
      name: t.aiMod.field_action,
      value: neutralizeMentions(input.actionLabel || "—"),
      inline: false,
    },
    {
      name: t.aiMod.review_attachments,
      value: attachmentField(input.attachments),
      inline: false,
    },
  ];

  const embed = new EmbedBuilder()
    .setColor(input.pending ? 0xffaa00 : 0x5865f2)
    .setTitle(`${input.feature}: ${t.aiMod.review_title}`)
    .setDescription(`**${t.aiMod.field_message}**\n${truncateContent(input.content)}`)
    .addFields(fields)
    .setFooter({ text: neutralizeMentions(input.caseRef) })
    .setTimestamp();

  if (firstImage) embed.setImage(firstImage.url);

  if (!input.pending) return { embed, components: [] };

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`modreview_${input.targetId}_confirm`)
      .setLabel(t.aiMod.review_confirm)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`modreview_${input.targetId}_correct`)
      .setLabel(t.aiMod.review_correct)
      .setStyle(ButtonStyle.Danger),
  );

  return { embed, components: [row] };
}
