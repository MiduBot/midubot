import type { Message } from "discord.js";
import { handleImagesCommand } from "@/features/images";
import { handleLogCommand } from "@/features/log-channel";
import { handleWhitelistCommand } from "@/features/whitelist";
import { handleLangCommand } from "@/features/language";
import { handleUniqueCommand } from "@/features/unique-channel";
import { handleVersionCommand } from "@/features/system";
import { handleLineFilterCommand } from "@/features/line-filter";
import { handleLinkCooldownCommand } from "@/features/link-cooldown";
import { handleLinkNewcomerCommand } from "@/features/link-newcomer";
import { handleNoteCommand, handleHistoryCommand, handleStatsCommand } from "@/features/mod-actions";
import { handleEvalCommand } from "@/features/eval";
import { handleAiCommand } from "@/features/ai";
import {
  handleAimodCommand,
  handleModroleCommand,
  handleIgnorechannelCommand,
  handleNotifyCommand,
  handleSelfpromochannelCommand,
} from "@/features/ai-mod";

export interface Command {
  name: string;
  aliases: string[];
  execute: (message: Message, args: string[], prefix: string) => Promise<void>;
}

const commands: Command[] = [
  {
    name: "images",
    aliases: ["img", "i", "image"],
    execute: handleImagesCommand,
  },
  {
    name: "log",
    aliases: ["logs", "l"],
    execute: handleLogCommand,
  },
  {
    name: "whitelist",
    aliases: ["wl"],
    execute: handleWhitelistCommand,
  },
  {
    name: "lang",
    aliases: ["language"],
    execute: handleLangCommand,
  },
  {
    name: "unique",
    aliases: ["u"],
    execute: handleUniqueCommand,
  },
  {
    name: "version",
    aliases: ["v", "ver"],
    execute: handleVersionCommand,
  },
  {
    name: "linefilter",
    aliases: ["lf"],
    execute: handleLineFilterCommand,
  },
  {
    name: "linkcooldown",
    aliases: ["linkcd", "lc"],
    execute: handleLinkCooldownCommand,
  },
  {
    name: "linknewcomer",
    aliases: ["linknew", "ln"],
    execute: handleLinkNewcomerCommand,
  },
  {
    name: "note",
    aliases: ["notes", "n"],
    execute: handleNoteCommand,
  },
  {
    name: "history",
    aliases: ["hist"],
    execute: handleHistoryCommand,
  },
  {
    name: "stats",
    aliases: ["st"],
    execute: handleStatsCommand,
  },
  {
    name: "eval",
    aliases: ["ev"],
    execute: handleEvalCommand,
  },
  {
    name: "aimod",
    aliases: ["aimod"],
    execute: handleAimodCommand,
  },
  {
    name: "modrole",
    aliases: ["modroles"],
    execute: handleModroleCommand,
  },
  {
    name: "ignorechannel",
    aliases: ["ignorech", "ic"],
    execute: handleIgnorechannelCommand,
  },
  {
    name: "notify",
    aliases: ["notif"],
    execute: handleNotifyCommand,
  },
  {
    name: "selfpromochannel",
    aliases: ["spc", "selfpromo"],
    execute: handleSelfpromochannelCommand,
  },
  {
    name: "ai",
    aliases: [],
    execute: handleAiCommand,
  },
];

const commandMap = new Map<string, Command>();
for (const cmd of commands) {
  commandMap.set(cmd.name, cmd);
  for (const alias of cmd.aliases) {
    commandMap.set(alias, cmd);
  }
}

export function getCommand(name: string): Command | undefined {
  return commandMap.get(name.toLowerCase());
}

export function getCommands(): Command[] {
  return commands;
}
