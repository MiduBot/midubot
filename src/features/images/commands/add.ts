import { Message } from "discord.js";
import { ImageService } from "@/features/images";
import type { Translations } from "@/i18n";

export async function handleAddImage(
  message: Message,
  guildId: string,
  args: string[],
  t: Translations,
): Promise<void> {
  if (args.length < 2) {
    await message.reply(t.images.usage_add);
    return;
  }

  const name = args[1];
  let url = args[2];

  if (!url) {
    const imageAttachment = message.attachments.find((att) =>
      att.contentType?.startsWith("image/"),
    );

    if (!imageAttachment) {
      await message.reply(t.images.no_url_or_att);
      return;
    }

    url = imageAttachment.url;
  }

  try {
    new URL(url);
  } catch {
    await message.reply(t.images.invalid_url);
    return;
  }

  const response = await message.reply(t.images.processing);

  try {
    await ImageService.addImage(guildId, name, url);
    await response.edit(t.images.added);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await response.edit(t.images.add_error.replace("{msg}", msg));
  }
}
