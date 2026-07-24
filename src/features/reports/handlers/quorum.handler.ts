import {
  ChannelType,
  type Guild,
  type Message,
  type TextChannel,
} from "discord.js";
import { removeReport } from "../services/report.service";
import {
  safeDelete,
  safeTimeout,
  normalizeText,
  extractImageUrls,
} from "@/core/discord/moderation";
import {
  ImageHashService,
  ImageService,
  getOrComputeFingerprint,
} from "@/features/images";
import { LogChannelService } from "@/features/log-channel";
import { ModActionService } from "@/features/mod-actions";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

const _24hoursInMs = 24 * 60 * 60 * 1000;

type Fingerprint = NonNullable<
  Awaited<ReturnType<typeof ImageHashService.downloadFingerprint>>
>;

type ReportSignature =
  | { type: "image"; fingerprint: Fingerprint; firstUrl: string }
  | { type: "text"; content: string }
  | null;

type SweepResult = {
  crossChannelDeletedCount: number;
  crossChannelDeleteFailures: number;
  crossChannelTimeoutFailures: number;
};

export async function handleReportQuorum(
  original: Message,
  guild: Guild,
): Promise<void> {
  const guildId = guild.id;
  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const signature = await extractSignature(original);

  if (signature?.type === "image") {
    try {
      await ImageService.addImage(
        guildId,
        `report-${original.id}`,
        signature.firstUrl,
      );
    } catch (e) {
      logger.warn(`Failed to auto-add reported image to DB: ${e}`);
    }
  }

  let deleteOriginalOk = false;
  let timeoutOriginalOk = false;
  deleteOriginalOk = await safeDelete(original, t.report.delete_reason);
  if (original.member) {
    timeoutOriginalOk = await safeTimeout(
      original.member,
      _24hoursInMs,
      t.report.timeout_reason,
    );
  }

  const sweep = await crossChannelSweep(
    guild,
    original.channelId,
    signature,
    t,
  );

  ModActionService.logAction(
    guildId,
    "report_quorum",
    original.author.id,
    null,
    t.report.timeout_reason,
    {
      crossChannelDeleted: sweep.crossChannelDeletedCount,
      deleteOriginalOk: deleteOriginalOk,
      timeoutOriginalOk: timeoutOriginalOk,
    },
  );

  await sendQuorumLog(guild, original, sweep, {
    deleteOriginalOk,
    timeoutOriginalOk,
    deleteReason: t.report.delete_reason,
  });

  removeReport(original.id);
}

async function extractSignature(original: Message): Promise<ReportSignature> {
  const imageUrls: string[] = [];
  for (const attachment of original.attachments.values()) {
    if (attachment.contentType?.startsWith("image/")) {
      imageUrls.push(attachment.url);
    }
  }
  imageUrls.push(...extractImageUrls(original.content));

  if (imageUrls.length > 0) {
    const firstUrl = imageUrls[0];
    const fingerprint = await getOrComputeFingerprint(firstUrl, () =>
      ImageHashService.downloadFingerprint(firstUrl),
    );
    if (fingerprint) {
      return { type: "image", fingerprint, firstUrl };
    }
  }

  if (original.content.trim().length > 0) {
    return { type: "text", content: normalizeText(original.content) };
  }

  return null;
}

async function crossChannelSweep(
  guild: Guild,
  originalChannelId: string,
  signature: ReportSignature,
  t: ReturnType<typeof getTranslation>,
): Promise<SweepResult> {
  let crossChannelDeletedCount = 0;
  let crossChannelDeleteFailures = 0;
  let crossChannelTimeoutFailures = 0;

  if (!signature) {
    return {
      crossChannelDeletedCount,
      crossChannelDeleteFailures,
      crossChannelTimeoutFailures,
    };
  }

  const allChannels = await guild.channels.fetch();
  const channels = allChannels.filter(
    (ch): ch is TextChannel =>
      ch !== null &&
      ch.type === ChannelType.GuildText &&
      ch.id !== originalChannelId,
  );

  for (const channel of channels.values()) {
    try {
      const messages = await channel.messages.fetch({ limit: 10 });
      for (const msg of messages.values()) {
        if (msg.author.bot) continue;

        const isMatch = await messageMatches(msg, signature);
        if (!isMatch) continue;

        const deleted = await safeDelete(msg, t.report.delete_reason);
        if (deleted) {
          crossChannelDeletedCount++;
        } else {
          crossChannelDeleteFailures++;
        }

        if (msg.member) {
          const timedOut = await safeTimeout(
            msg.member,
            _24hoursInMs,
            t.report.timeout_reason,
          );
          if (!timedOut) crossChannelTimeoutFailures++;
        }
      }
    } catch (error) {
      logger.warn(
        `Failed to scan channel ${channel.id} for cross-channel matches: ${error}`,
      );
    }
  }

  return {
    crossChannelDeletedCount,
    crossChannelDeleteFailures,
    crossChannelTimeoutFailures,
  };
}

async function messageMatches(
  msg: Message,
  signature: ReportSignature,
): Promise<boolean> {
  if (!signature) return false;

  if (signature.type === "image") {
    const msgImageUrls: string[] = [];
    for (const att of msg.attachments.values()) {
      if (att.contentType?.startsWith("image/")) msgImageUrls.push(att.url);
    }
    msgImageUrls.push(...extractImageUrls(msg.content));

    for (const url of msgImageUrls) {
      const msgFingerprint = await getOrComputeFingerprint(url, () =>
        ImageHashService.downloadFingerprint(url),
      );
      if (msgFingerprint) {
        const similarity = ImageHashService.compareFingerprints(
          signature.fingerprint,
          msgFingerprint,
        );
        if (similarity.isSimilar) return true;
      }
    }
    return false;
  }

  if (signature.type === "text") {
    return normalizeText(msg.content) === signature.content;
  }

  return false;
}

async function sendQuorumLog(
  guild: Guild,
  original: Message,
  sweep: SweepResult,
  meta: {
    deleteOriginalOk: boolean;
    timeoutOriginalOk: boolean;
    deleteReason: string;
  },
): Promise<void> {
  const guildId = guild.id;
  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const logChannelId = await LogChannelService.getLogChannel(guildId);
  if (!logChannelId) return;

  const logChannel = await guild.channels.fetch(logChannelId);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: "Autor original",
      value: `<@${original.author.id}> (${original.author.id})`,
      inline: true,
    },
    {
      name: "Canal original",
      value: `<#${original.channelId}>`,
      inline: true,
    },
    {
      name: "Mensajes cross-channel eliminados",
      value: sweep.crossChannelDeletedCount.toString(),
      inline: true,
    },
    {
      name: "Contenido original",
      value:
        original.content.length > 500
          ? original.content.substring(0, 500) + "..."
          : original.content || "*Sin texto*",
      inline: false,
    },
  ];

  const failures: string[] = [];
  if (!meta.deleteOriginalOk)
    failures.push("No se pudo borrar el mensaje original");
  if (!meta.timeoutOriginalOk)
    failures.push("No se pudo aplicar timeout al autor");
  if (sweep.crossChannelDeleteFailures > 0)
    failures.push(
      `${sweep.crossChannelDeleteFailures} borrados cross-channel fallidos`,
    );
  if (sweep.crossChannelTimeoutFailures > 0)
    failures.push(
      `${sweep.crossChannelTimeoutFailures} timeouts cross-channel fallidos`,
    );

  if (failures.length > 0) {
    fields.push({
      name: "⚠️ Acciones fallidas",
      value: failures.join("\n"),
      inline: false,
    });
  }

  const embed = {
    color: 0xff0000,
    title: t.report.quorum_reached,
    fields,
    footer: { text: t.report.log_footer },
    timestamp: new Date().toISOString(),
  };

  await logChannel
    .send({ embeds: [embed] })
    .catch((e) => logger.error("Failed to send log embed", e));
}
