import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { env } from "@/config/env";
import { logger } from "@/core/logger";
import {
  markHealthy,
  markUnhealthy,
  startHealthServer,
} from "@/core/health";
import { handleClientReady } from "@/events/client-ready";
import { handleMessageCreate } from "@/events/message-create";
import { handleInteractionCreate } from "@/events/interaction-create";
import { handleMessageDelete } from "@/events/message-delete";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const healthServer = startHealthServer(env.HEALTH_PORT);
logger.info(`Health server listening on :${env.HEALTH_PORT}`);

client.once("clientReady", () => {
  markHealthy();
  void handleClientReady(client);
});

client.on("messageCreate", (message) => void handleMessageCreate(message, client));

client.on("interactionCreate", (interaction) =>
  void handleInteractionCreate(interaction),
);

client.on("messageDelete", (deleted) => handleMessageDelete(deleted));

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down...`);
  markUnhealthy();
  healthServer.stop();
  client.destroy();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info("Bot is starting...");

client.login(env.DISCORD_TOKEN).then(() => {
  logger.info("Bot has started successfully!");
}).catch((error) => {
  logger.error("Bot failed to start", error);
  process.exit(1);
});
