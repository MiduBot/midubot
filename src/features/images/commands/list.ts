import { Message } from "discord.js";
import { ImageService } from "@/features/images";
import { listStates, buildListEmbed } from "./list-state";
import type { Translations } from "@/i18n";

export async function handleListImages(
  message: Message,
  guildId: string,
  t: Translations,
): Promise<void> {
  const response = await message.reply(t.images.loading);

  try {
    const images = await ImageService.listImages(guildId);

    if (images.length === 0) {
      await response.edit(t.images.no_images);
      return;
    }

    const state = {
      images,
      page: 0,
      filter: "",
    };

    listStates.set(response.id, state);
    setTimeout(() => listStates.delete(response.id), 15 * 60 * 1000);
    await response.edit(buildListEmbed(state, t));
  } catch (error) {
    await response.edit(t.images.list_error);
  }
}
