import { Client } from "discord.js";
import { env } from "@/config/env";
import { logger } from "@/core/logger";

export async function handleClientReady(client: Client): Promise<void> {
  logger.info(`✅ Bot logged in as ${client.user?.tag}`);
  client.user?.setActivity(`${env.DISCORD_PREFIX}help`, { type: 0 });

  const guilds = await client.guilds.fetch();
  for (const [, oauth2Guild] of guilds) {
    try {
      const guild = await client.guilds.fetch(oauth2Guild.id);
      await guild.commands.create({
        name: "Reportar",
        type: 3,
      });
      await guild.commands.create({
        name: "Puff",
        type: 3,
      });
      await guild.commands.create({
        name: "Añadir Nota",
        type: 3,
      });
      await guild.commands.create({
        name: "Añadir Nota",
        type: 2,
      });
    } catch (e) {
      logger.warn(
        `Failed to register context menu commands in guild ${oauth2Guild.id}: ${e}`,
      );
    }
  }
}
