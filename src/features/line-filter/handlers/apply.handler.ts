import type { Message, Client } from "discord.js";
import { LineFilterService } from "@/features/line-filter";

export async function applyLineFilter(
  message: Message,
  client: Client,
): Promise<void> {
  if (!message.guild || message.author.bot) return;
  await LineFilterService.applyFilter(message, client);
}
