import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import type { Translations } from "@/i18n";

export interface FlaggedEmbedInput {
  caseId: number;
  authorTag: string;
  authorId: string;
  channelId: string;
  confidence: number;
  platform: number;
  verdict: number;
  reason: string;
  actionLabel: string;
}

const PLATFORM_LABEL: Record<number, string> = {
  0: "—",
  1: "YouTube",
  2: "LinkedIn",
  3: "X / Instagram",
  4: "Otra",
};

export function buildPingString(
  targets: { targetId: string; targetType: "user" | "role" }[],
): string {
  return targets
    .map((tgt) =>
      tgt.targetType === "role"
        ? `<@&${tgt.targetId}>`
        : `<@${tgt.targetId}>`,
    )
    .join(" ");
}

export function buildFlaggedEmbed(
  input: FlaggedEmbedInput,
  t: Translations,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const isSelfpromo = input.verdict === 2;
  const title = isSelfpromo
    ? input.platform === 4
      ? t.aiMod.flagged_selfpromo_title
      : t.aiMod.flagged_selfpromo_bypass_title
    : t.aiMod.flagged_malicious_title;
  const color = isSelfpromo && input.platform !== 4 ? 0xffaa00 : 0xff4d4d;

  const highConfidence = input.confidence >= 0.8;
  const confidenceBand = highConfidence
    ? t.aiMod.confidence_high
    : t.aiMod.confidence_low;
  const confidenceValue = `${Math.round(input.confidence * 100)}% (${confidenceBand})`;

  const fields = [
    { name: t.aiMod.field_author, value: `${input.authorTag} (${input.authorId})`, inline: true },
    { name: t.aiMod.field_channel, value: `<#${input.channelId}>`, inline: true },
    { name: t.aiMod.field_confidence, value: confidenceValue, inline: true },
  ];
  if (isSelfpromo) {
    fields.push({ name: t.aiMod.field_platform, value: PLATFORM_LABEL[input.platform] ?? "—", inline: true });
  }
  fields.push({ name: t.aiMod.field_reason, value: (input.reason || "—").slice(0, 1024), inline: false });
  fields.push({ name: t.aiMod.field_action, value: input.actionLabel, inline: false });

  // Low-confidence / fallback: amber; high-confidence malicious: red; selfpromo platform bypass-ish: amber.
  const embedColor =
    !highConfidence ? 0xffaa00 : color;

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(title)
    .addFields(fields)
    .setFooter({ text: t.aiMod.footer_case_id.replace("{id}", String(input.caseId)) })
    .setTimestamp();

  const correctBtn = new ButtonBuilder()
    .setCustomId(`aimod_${input.caseId}_correct`)
    .setLabel(t.aiMod.button_correct)
    .setStyle(ButtonStyle.Success);
  const incorrectBtn = new ButtonBuilder()
    .setCustomId(`aimod_${input.caseId}_incorrect`)
    .setLabel(t.aiMod.button_incorrect)
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    correctBtn,
    incorrectBtn,
  );

  return { embed, components: [row] };
}

export interface PrecautionCandidateWithCase {
  url: string;
  authorTag: string;
  caseId: number;
}

export function buildPrecautionEmbed(
  candidates: PrecautionCandidateWithCase[],
  t: Translations,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const numbered = candidates.map((c, i) => ({ ...c, index: i + 1 }));
  const description =
    candidates.length === 0
      ? t.aiMod.precaution_desc
      : numbered
          .map((c) => `${c.index}. [msg](${c.url}) — ${c.authorTag}`)
          .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle(t.aiMod.precaution_title)
    .setDescription(description.slice(0, 4096))
    .setTimestamp();

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < numbered.length; i += 2) {
    const chunk = numbered.slice(i, i + 2);
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const c of chunk) {
      const labelSuffix = numbered.length > 1 ? ` ${c.index}` : "";
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`aimod_${c.caseId}_correct`)
          .setLabel(`${t.aiMod.button_correct}${labelSuffix}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`aimod_${c.caseId}_incorrect`)
          .setLabel(`${t.aiMod.button_incorrect}${labelSuffix}`)
          .setStyle(ButtonStyle.Danger),
      );
    }
    components.push(row);
  }

  return { embed, components };
}
