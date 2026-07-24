import { Message, PartialMessage } from "discord.js";
import { handleReportMessageDelete } from "@/features/reports";
import { logger } from "@/core/logger";

export function handleMessageDelete(deleted: Message | PartialMessage): void {
  try {
    handleReportMessageDelete(deleted);
  } catch (error) {
    logger.warn(`Error handling report messageDelete: ${error}`);
  }
}
