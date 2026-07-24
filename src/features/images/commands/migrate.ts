import { Message } from "discord.js";
import { ImageService } from "@/features/images";
import { logger } from "@/core/logger";
import type { Translations } from "@/i18n";

export async function handleMigrateImages(
  message: Message,
  guildId: string,
  t: Translations,
): Promise<void> {
  const PROGRESS_THROTTLE_MS = 3000;
  const response = await message.reply(t.images.migrate_starting);

  let lastEdit = 0;
  let lastKey = "";

  try {
    const result = await ImageService.migrateImageFingerprints(
      guildId,
      (current, total) => {
        const now = Date.now();
        const key = `${current}/${total}`;
        if (key === lastKey) return;
        if (now - lastEdit < PROGRESS_THROTTLE_MS) return;
        lastEdit = now;
        lastKey = key;
        void response
          .edit(
            t.images.migrate_progress
              .replace("{current}", String(current))
              .replace("{total}", String(total)),
          )
          .catch(() => {});
      },
    );

    const lines: string[] = [
      t.images.migrate_done,
      t.images.migrate_total.replace("{total}", String(result.total)),
      t.images.migrate_already.replace("{n}", String(result.alreadyMigrated)),
      t.images.migrate_migrated.replace("{n}", String(result.migrated)),
      t.images.migrate_failed.replace("{n}", String(result.failed)),
    ];

    if (result.failures.length > 0) {
      const top = result.failures.slice(0, 5);
      lines.push("");
      lines.push(t.images.migrate_failures_header);
      for (const f of top) {
        lines.push(`• \`${f.name}\` — ${f.reason}`);
      }
      const extra = result.failures.length - top.length;
      if (extra > 0) {
        lines.push(t.images.migrate_more.replace("{n}", String(extra)));
      }
    }

    const payload = lines.join("\n");
    const safe =
      payload.length > 1900 ? payload.slice(0, 1897) + "..." : payload;

    await response.edit(safe);
  } catch (error: unknown) {
    logger.error("Failed to migrate image fingerprints", error);
    const msg = error instanceof Error ? error.message : String(error);
    await response.edit(t.images.migrate_error.replace("{msg}", msg));
  }
}
