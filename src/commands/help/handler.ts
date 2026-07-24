import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { LanguageService } from "@/features/language";
import { env } from "@/config/env";
import { logger } from "@/core/logger";
import {
  type HelpView,
  buildHelpView,
  parseHelpCustomId,
  resolveViewFromSelect,
  resolveViewFromTarget,
} from "./view";

async function replyForbidden(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const opts = {
    content: "❌ Solo quien abrió la ayuda puede usar estos controles.",
    ephemeral: true,
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(opts).catch(() => {});
  } else {
    await interaction.reply(opts).catch(() => {});
  }
}

async function renderTo(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  view: HelpView,
): Promise<void> {
  const guildId = interaction.guild?.id;
  const lang = guildId
    ? await LanguageService.getLanguage(guildId)
    : "es";
  const viewData = buildHelpView(view, lang, env.DISCORD_PREFIX, interaction.user.id);
  await interaction.update({
    embeds: viewData.embeds,
    components: viewData.components,
  });
}

export async function handleHelpSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseHelpCustomId(interaction.customId);
  const ownerId = parsed.kind === "select" ? parsed.userId : null;
  if (!ownerId) {
    logger.warn("help_select missing userId in customId");
    return;
  }
  if (interaction.user.id !== ownerId) {
    await replyForbidden(interaction);
    return;
  }

  const value = interaction.values[0];
  const view = resolveViewFromSelect(value);
  if (!view) return;

  await renderTo(interaction, view);
}

export async function handleHelpButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseHelpCustomId(interaction.customId);

  if (parsed.kind === "other") return;

  const ownerId = "userId" in parsed ? parsed.userId : null;
  if (!ownerId) {
    logger.warn("help button missing userId in customId");
    return;
  }
  if (interaction.user.id !== ownerId) {
    await replyForbidden(interaction);
    return;
  }

  if (parsed.kind === "close") {
    await interaction.update({ content: "✅", embeds: [], components: [] });
    return;
  }

  if (parsed.kind === "home") {
    await renderTo(interaction, { kind: "home" });
    return;
  }

  if (parsed.kind === "back") {
    const view = resolveViewFromTarget(parsed.target);
    if (!view) {
      await renderTo(interaction, { kind: "home" });
      return;
    }
    await renderTo(interaction, view);
    return;
  }
}
