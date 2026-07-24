import { Message } from "discord.js";
import { ImageService, ImageHashService } from "@/features/images";
import { logger } from "@/core/logger";
import type { Translations } from "@/i18n";

export async function handleCheckImage(
  message: Message,
  guildId: string,
  args: string[],
  t: Translations,
): Promise<void> {
  let url = args[1];

  if (!url) {
    const imageAttachment = message.attachments.find((att) =>
      att.contentType?.startsWith("image/"),
    );

    if (!imageAttachment) {
      await message.reply(t.images.usage_check);
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

  const response = await message.reply(t.images.check_processing);

  try {
    const fingerprint = await ImageHashService.downloadFingerprint(url);

    if (!fingerprint || !fingerprint.dhash) {
      await response.edit(
        t.images.check_error.replace(
          "{msg}",
          "No se pudo descargar o procesar la imagen.",
        ),
      );
      return;
    }

    const matches = await ImageService.findSimilarImagesByFingerprint(
      guildId,
      fingerprint,
    );

    if (matches.length === 0) {
      await response.edit(t.images.check_no_matches);
      return;
    }

    const matchLines = matches.map((m) =>
      t.images.check_match
        .replace("{name}", m.name)
        .replace("{confidence}", String(m.similarity.confidence)),
    );

    const embed = {
      color: 0xff9900,
      title: t.images.check_found_matches.replace(
        "{count}",
        String(matches.length),
      ),
      description: matchLines.join("\n"),
      footer: {
        text: t.images.list_total.replace("{total}", String(matches.length)),
      },
    };

    await response.edit({ content: "", embeds: [embed] });
  } catch (error: unknown) {
    logger.error("Error checking image", error);
    const msg = error instanceof Error ? error.message : String(error);
    await response.edit(t.images.check_error.replace("{msg}", msg));
  }
}
