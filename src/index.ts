import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "@/config/env";
import { logger } from "@/core/logger";
import {
  markHealthy,
  markUnhealthy,
  startHealthServer,
} from "@/core/health";
import {
  claimInstance,
  createInstanceId,
  watchInstance,
} from "@/core/instance-lock";
import { handleClientReady } from "@/events/client-ready";
import { handleMessageCreate } from "@/events/message-create";
import { handleInteractionCreate } from "@/events/interaction-create";
import { handleMessageDelete } from "@/events/message-delete";
import { handleChatFeedbackReaction } from "@/features/ai";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const instanceId = createInstanceId();
let stopWatch: (() => void) | undefined;
let shuttingDown = false;

const healthServer = startHealthServer(env.HEALTH_PORT);
logger.info(`Health server listening on :${env.HEALTH_PORT}`);

client.once("clientReady", () => {
  void (async () => {
    try {
      await claimInstance(instanceId);
      logger.info(`Instance lock claimed (${instanceId})`);
      stopWatch = watchInstance(instanceId, () => shutdown("superseded"));
    } catch (error) {
      logger.error("Failed to claim instance lock", error);
    }
    markHealthy();
    void handleClientReady(client);
  })();
});

client.on("messageCreate", (message) => void handleMessageCreate(message, client));

client.on("interactionCreate", (interaction) =>
  void handleInteractionCreate(interaction),
);

client.on("messageDelete", (deleted) => handleMessageDelete(deleted));

client.on("messageReactionAdd", (reaction, user) =>
  void handleChatFeedbackReaction(reaction, user),
);

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);
  stopWatch?.();
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
