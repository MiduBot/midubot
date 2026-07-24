import { Message } from "discord.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  name: string;
  version: string;
}

function loadPackageInfo(): PackageJson {
  try {
    const pkgPath = resolve(process.cwd(), "package.json");
    const raw = readFileSync(pkgPath, "utf-8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return { name: "midubot", version: "0.0.0" };
  }
}

const pkg = loadPackageInfo();

export async function handleVersionCommand(message: Message): Promise<void> {
  const embed = {
    color: 0x0099ff,
    title: "🤖 MiduBot",
    fields: [
      { name: "Name", value: pkg.name, inline: true },
      { name: "Version", value: `\`${pkg.version}\``, inline: true },
    ],
    footer: { text: `Node ${process.version}` },
    timestamp: new Date().toISOString(),
  };

  await message.reply({ embeds: [embed] });
}
