import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import {
  CATEGORY_ORDER,
  getCatalog,
  getCategory,
  getSubcommand,
  type CategoryHelp,
  type HelpCategoryId,
  type SubcommandHelp,
} from "./catalog";
import { getTranslation, type Language, type Translations } from "@/i18n";

export type HelpView =
  | { kind: "home" }
  | { kind: "cat"; id: HelpCategoryId }
  | { kind: "sub"; cat: HelpCategoryId; id: string };

export const HELP_CUSTOM_IDS = {
  selectPrefix: "help_select",
  homePrefix: "help_home",
  backPrefix: "help_back",
  closePrefix: "help_close",
} as const;

export function selectCustomId(userId: string): string {
  return `${HELP_CUSTOM_IDS.selectPrefix}:${userId}`;
}

export function homeCustomId(userId: string): string {
  return `${HELP_CUSTOM_IDS.homePrefix}:${userId}`;
}

export function backCustomId(target: string, userId: string): string {
  return `${HELP_CUSTOM_IDS.backPrefix}:${target}:${userId}`;
}

export function closeCustomId(userId: string): string {
  return `${HELP_CUSTOM_IDS.closePrefix}:${userId}`;
}

export function parseHelpCustomId(
  customId: string,
):
  | { kind: "select"; userId: string | null }
  | { kind: "home"; userId: string | null }
  | { kind: "back"; target: string; userId: string | null }
  | { kind: "close"; userId: string | null }
  | { kind: "other" } {
  for (const prefix of [
    HELP_CUSTOM_IDS.selectPrefix,
    HELP_CUSTOM_IDS.homePrefix,
    HELP_CUSTOM_IDS.closePrefix,
  ]) {
    if (customId === prefix) {
      return { kind: prefix.slice(5) as "select" | "home" | "close", userId: null };
    }
  }
  const parts = customId.split(":");
  const [head, ...rest] = parts;
  if (head === HELP_CUSTOM_IDS.selectPrefix) {
    return { kind: "select", userId: rest.join(":") || null };
  }
  if (head === HELP_CUSTOM_IDS.homePrefix) {
    return { kind: "home", userId: rest.join(":") || null };
  }
  if (head === HELP_CUSTOM_IDS.closePrefix) {
    return { kind: "close", userId: rest.join(":") || null };
  }
  if (head === HELP_CUSTOM_IDS.backPrefix) {
    const userId = rest.length > 0 ? rest[rest.length - 1] : null;
    const target = rest.length > 1 ? rest.slice(0, -1).join(":") : "home";
    return { kind: "back", target, userId };
  }
  return { kind: "other" };
}

function viewToSelectValue(view: HelpView): string {
  if (view.kind === "home") return "home";
  if (view.kind === "cat") return `cat:${view.id}`;
  return `sub:${view.cat}:${view.id}`;
}

function parseSelectValue(
  value: string,
): HelpView | null {
  if (value === "home") return { kind: "home" };
  if (value.startsWith("cat:")) {
    const id = value.slice(4);
    if (!isHelpCategoryId(id)) return null;
    return { kind: "cat", id };
  }
  if (value.startsWith("sub:")) {
    const rest = value.slice(4);
    const idx = rest.indexOf(":");
    if (idx < 0) return null;
    const catId = rest.slice(0, idx);
    if (!isHelpCategoryId(catId)) return null;
    return {
      kind: "sub",
      cat: catId,
      id: rest.slice(idx + 1),
    };
  }
  return null;
}

function replacePrefix(text: string, prefix: string): string {
  return text.replace(/\{prefix\}/g, prefix);
}

function backTargetOf(view: HelpView): string {
  if (view.kind === "home") return "home";
  if (view.kind === "cat") return "home";
  return `cat:${view.cat}`;
}

function renderFooter(
  t: Translations,
  prefix: string,
  userId: string,
  extra?: string,
): { text: string } {
  const base = t.help.footer_text
    .replace("{prefix}", prefix)
    .replace("{user}", `<@${userId}>`);
  return { text: extra ? `${base} • ${extra}` : base };
}

function commandDisplay(sub: SubcommandHelp, prefix: string): string {
  if (sub.usage.startsWith("{prefix}")) {
    return `\`${prefix}${sub.name}\``;
  }
  return `*${sub.name}*`;
}

function buildHomeEmbed(
  t: Translations,
  prefix: string,
  userId: string,
  lang: Language,
): EmbedBuilder {
  const catalog = getCatalog(lang);
  const total = catalog.reduce((acc, c) => acc + c.subcommands.length, 0);
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(t.help.title)
    .setDescription(t.help.home_intro)
    .setTimestamp(new Date());

  for (const cat of catalog) {
    embed.addFields({
      name: `${cat.emoji} **${cat.name}** — ${cat.shortDescription}`,
      value: cat.subcommands
        .map(
          (s) =>
            `${s.emoji} ${commandDisplay(s, prefix)} — ${s.summary}`,
        )
        .join("\n"),
      inline: false,
    });
  }

  embed.addFields({
    name: t.help.stats_title,
    value:
      `📦 ${catalog.length} ${t.help.stats_categories} • ` +
      `📚 ${total} ${t.help.stats_commands}`,
    inline: false,
  });

  embed.setFooter(renderFooter(t, prefix, userId));
  return embed;
}

function buildCategoryEmbed(
  t: Translations,
  prefix: string,
  userId: string,
  cat: CategoryHelp,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${cat.emoji} ${cat.name}`)
    .setDescription(cat.longDescription)
    .setTimestamp(new Date());

  embed.addFields({
    name: t.help.sections_title.replace("📚", "▸"),
    value: cat.subcommands
      .map(
        (s) =>
          `▸ \`${replacePrefix(s.usage, prefix).split(" ")[0]}\` — ${s.summary}`,
      )
      .join("\n"),
    inline: false,
  });

  if (cat.subcommands.length > 0) {
    embed.addFields({
      name: t.help.cat_hint,
      value: t.help.cat_hint_value,
      inline: false,
    });
  }

  embed.setFooter(
    renderFooter(t, prefix, userId, `${cat.subcommands.length} ${t.help.commands_count}`),
  );
  return embed;
}

function buildSubcommandEmbed(
  t: Translations,
  prefix: string,
  userId: string,
  cat: CategoryHelp,
  sub: SubcommandHelp,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${cat.emoji} ${cat.name}  ›  ${sub.emoji} ${sub.name}`)
    .setDescription(sub.detail)
    .setTimestamp(new Date());

  embed.addFields({
    name: `📋 ${t.help.field_usage}`,
    value: `\`\`\`\n${replacePrefix(sub.usage, prefix)}\n\`\`\``,
    inline: false,
  });

  if (sub.aliases && sub.aliases.length > 0) {
    embed.addFields({
      name: `🔗 ${t.help.field_aliases}`,
      value: sub.aliases.map((a) => `\`${a}\``).join("  "),
      inline: false,
    });
  }

  if (sub.examples.length > 0) {
    embed.addFields({
      name: `📂 ${t.help.field_examples}`,
      value: sub.examples
        .map((e) => `\`\`\`\n${replacePrefix(e, prefix)}\n\`\`\``)
        .join(""),
      inline: false,
    });
  }

  embed.addFields({
    name: `🔐 ${t.help.field_permissions}`,
    value: sub.permissions,
    inline: false,
  });

  if (sub.notes) {
    embed.addFields({
      name: `💡 ${t.help.field_notes}`,
      value: sub.notes,
      inline: false,
    });
  }

  if (sub.related && sub.related.length > 0) {
    embed.addFields({
      name: `📎 ${t.help.field_related}`,
      value: sub.related.map((r) => `\`${replacePrefix(r, prefix)}\``).join("  "),
      inline: false,
    });
  }

  embed.setFooter(
    renderFooter(
      t,
      prefix,
      userId,
      `${cat.emoji} ${cat.name} › ${sub.emoji} ${sub.name}`,
    ),
  );
  return embed;
}

function buildCategorySelect(
  t: Translations,
  userId: string,
  lang: "es" | "en",
  current: HelpView,
): StringSelectMenuBuilder {
  const catalog = getCatalog(lang);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId(userId))
    .setPlaceholder(t.help.menu_placeholder)
    .setMinValues(1)
    .setMaxValues(1);

  const currentValue = viewToSelectValue(current);

  menu.addOptions(
    catalog.map((c) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(c.name)
        .setValue(`cat:${c.id}`)
        .setDescription(c.shortDescription.slice(0, 100))
        .setEmoji(c.emoji)
        .setDefault(currentValue === `cat:${c.id}`),
    ),
  );

  return menu;
}

function buildSubcommandSelect(
  t: Translations,
  userId: string,
  cat: CategoryHelp,
  current: HelpView,
): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId(userId))
    .setPlaceholder(`${t.help.menu_sub_placeholder_prefix} ${cat.emoji} ${cat.name}`)
    .setMinValues(1)
    .setMaxValues(1);

  const currentValue = viewToSelectValue(current);

  menu.addOptions(
    cat.subcommands.map((s) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.name)
        .setValue(`sub:${cat.id}:${s.id}`)
        .setDescription(s.summary.slice(0, 100))
        .setEmoji(s.emoji)
        .setDefault(currentValue === `sub:${cat.id}:${s.id}`),
    ),
  );

  return menu;
}

function buildButtonRow(
  t: Translations,
  userId: string,
  view: HelpView,
): ActionRowBuilder<ButtonBuilder> {
  const homeBtn = new ButtonBuilder()
    .setCustomId(homeCustomId(userId))
    .setLabel(t.help.btn_home)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🏠");

  const backBtn = new ButtonBuilder()
    .setCustomId(backCustomId(backTargetOf(view), userId))
    .setLabel(t.help.btn_back)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("↩️");

  const closeBtn = new ButtonBuilder()
    .setCustomId(closeCustomId(userId))
    .setLabel(t.help.btn_close)
    .setStyle(ButtonStyle.Danger)
    .setEmoji("✖️");

  if (view.kind === "home") {
    homeBtn.setDisabled(true);
    backBtn.setDisabled(true);
  } else if (view.kind === "cat") {
    backBtn.setDisabled(false);
  } else {
    backBtn.setDisabled(false);
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    homeBtn,
    backBtn,
    closeBtn,
  );
}

export interface HelpViewResult {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<
    ButtonBuilder | StringSelectMenuBuilder
  >[];
}

export function buildHelpView(
  view: HelpView,
  lang: "es" | "en",
  prefix: string,
  userId: string,
): HelpViewResult {
  const t = getTranslation(lang);

  if (view.kind === "home") {
    const embed = buildHomeEmbed(t, prefix, userId, lang);
    const select = buildCategorySelect(t, userId, lang, view);
    const buttons = buildButtonRow(t, userId, view);
    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
        buttons,
      ],
    };
  }

  if (view.kind === "cat") {
    const cat = getCategory(lang, view.id);
    if (!cat) {
      return buildHelpView({ kind: "home" }, lang, prefix, userId);
    }
    const embed = buildCategoryEmbed(t, prefix, userId, cat);
    const select = buildSubcommandSelect(t, userId, cat, view);
    const buttons = buildButtonRow(t, userId, view);
    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
        buttons,
      ],
    };
  }

  const cat = getCategory(lang, view.cat);
  if (!cat) {
    return buildHelpView({ kind: "home" }, lang, prefix, userId);
  }

  const sub = getSubcommand(lang, view.cat, view.id);
  if (!sub) {
    return buildHelpView({ kind: "cat", id: view.cat }, lang, prefix, userId);
  }

  const embed = buildSubcommandEmbed(t, prefix, userId, cat, sub);
  const select = buildSubcommandSelect(t, userId, cat, view);
  const buttons = buildButtonRow(t, userId, view);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      buttons,
    ],
  };
}

export function resolveViewFromSelect(value: string): HelpView | null {
  return parseSelectValue(value);
}

export function resolveViewFromTarget(
  target: string,
): HelpView | null {
  return parseSelectValue(target);
}

export function isHelpCategoryId(value: string): value is HelpCategoryId {
  return CATEGORY_ORDER.includes(value as HelpCategoryId);
}
