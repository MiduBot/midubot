import type { Message, PartialMessage } from "discord.js";
import { getReport, removeReport } from "../services/report.service";
import { logger } from "@/core/logger";

export function handleReportMessageDelete(
  deleted: Message | PartialMessage,
): void {
  if (!deleted.id) return;

  const entry = getReport(deleted.id);
  if (!entry) return;

  logger.info(
    `Report target ${deleted.id} was deleted externally, cleaning up cache`,
  );
  removeReport(deleted.id);
}
