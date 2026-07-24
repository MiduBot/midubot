import { Message } from "discord.js";
import { ImageService, ImageHashService } from "@/features/images";
import type { Translations } from "@/i18n";

export async function handleRemoveImage(
  message: Message,
  guildId: string,
  args: string[],
  t: Translations,
): Promise<void> {
  if (args.length >= 2) {
    const name = args[1];
    const response = await message.reply(t.images.removing);

    try {
      await ImageService.removeImage(guildId, name);
      await response.edit(t.images.removed);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await response.edit(t.images.rm_error.replace("{msg}", msg));
    }
    return;
  }

  let url: string | undefined;

  const imageAttachment = message.attachments.find((att) =>
    att.contentType?.startsWith("image/"),
  );

  if (imageAttachment) {
    url = imageAttachment.url;
  }

  if (!url) {
    await message.reply(t.images.usage_rm);
    return;
  }

  try {
    new URL(url);
  } catch {
    await message.reply(t.images.invalid_url);
    return;
  }

  const response = await message.reply(t.images.removing_by_img);

  try {
    const hash = await ImageHashService.downloadAndHash(url);

    if (!hash) {
      await response.edit(t.images.rm_hash_error);
      return;
    }

    await ImageService.removeImageByHash(guildId, hash);
    await response.edit(t.images.removed);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await response.edit(t.images.rm_error.replace("{msg}", msg));
  }
}
