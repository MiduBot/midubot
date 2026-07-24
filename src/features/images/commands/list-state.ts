import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
} from "discord.js";
import type { ListState } from "../types";
import { ITEMS_PER_PAGE } from "../types";
import type { Translations } from "@/i18n";

export const listStates = new Map<string, ListState>();

export function buildListEmbed(
  state: ListState,
  t: Translations,
): { embeds: APIEmbed[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const filtered = state.filter
    ? state.images.filter((img) =>
        img.name.toLowerCase().includes(state.filter.toLowerCase()),
      )
    : state.images;

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const page = Math.min(state.page, totalPages - 1);
  state.page = page;

  const startIdx = page * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const description =
    filtered.length === 0
      ? state.filter
        ? t.images.no_filter_results
        : t.images.no_images
      : pageItems
          .map(
            (img, i) =>
              `${startIdx + i + 1}. **${img.name}** - Hash: \`${img.hash}\` - [URL](${img.url})`,
          )
          .join("\n");

  const footerParts = [
    t.images.list_page
      .replace("{page}", String(page + 1))
      .replace("{total}", String(totalPages)),
    t.images.list_total.replace("{total}", String(filtered.length)),
  ];
  if (state.filter) {
    footerParts.push(
      t.images.filter_active.replace("{filter}", state.filter),
    );
  }

  const embed: APIEmbed = {
    color: 0x0099ff,
    title: t.images.list_title,
    description,
    footer: { text: footerParts.join(" | ") },
  };

  const prevBtn = new ButtonBuilder()
    .setCustomId("images_prev")
    .setLabel(t.images.prev_button)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId("images_next")
    .setLabel(t.images.next_button)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const filterBtn = new ButtonBuilder()
    .setCustomId("images_filter")
    .setLabel(t.images.filter_button)
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🔍");

  const clearBtn = new ButtonBuilder()
    .setCustomId("images_clear")
    .setLabel(t.images.filter_clear)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!state.filter);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevBtn,
    nextBtn,
    filterBtn,
    clearBtn,
  );

  return { embeds: [embed], components: [row] };
}
