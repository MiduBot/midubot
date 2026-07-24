import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../mocks/discord";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { sendHelpMessage } from "@/commands/help.command";
import { getCommand, getCommands } from "@/commands/registry";
import {
  buildHelpView,
  isHelpCategoryId,
  parseHelpCustomId,
  selectCustomId,
  homeCustomId,
  backCustomId,
  closeCustomId,
  getCatalog,
  getCategory,
  getSubcommand,
  totalSubcommands,
  CATEGORY_ORDER,
  resolveViewFromSelect,
  resolveViewFromTarget,
} from "@/commands/help";
import { env } from "@/config/env";

function makeMessageWithPerms(opts: { hasManageMessages?: boolean } = {}) {
  const msg = createMockMessage();
  const has = opts.hasManageMessages ?? true;
  (msg.member as unknown as { permissions: { has: (p: string) => boolean } }).permissions = {
    has: (p: string) => p === "ManageMessages" && has,
  };
  return msg;
}

describe("sendHelpMessage", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("sends interactive help embed to a user with ManageMessages", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    const msg = makeMessageWithPerms();
    await sendHelpMessage(msg);
    expect(msg.reply).toHaveBeenCalled();
    const call = (msg.reply as ReturnType<typeof mock>).mock.calls[0]?.[0] as
      | { embeds?: unknown[]; components?: unknown[] }
      | undefined;
    expect(call?.embeds?.length).toBe(1);
    expect(call?.components?.length).toBe(2);
  });

  it("uses configured language (en)", async () => {
    setTableResult("guildConfigsTable", "findFirst", { language: "en" });
    const msg = makeMessageWithPerms();
    await sendHelpMessage(msg);
    expect(msg.reply).toHaveBeenCalled();
  });

  it("replies with not_allowed when user lacks ManageMessages", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    const msg = makeMessageWithPerms({ hasManageMessages: false });
    await sendHelpMessage(msg);
    const call = (msg.reply as ReturnType<typeof mock>).mock.calls[0]?.[0] as
      | { content?: string; embeds?: unknown[] }
      | undefined;
    expect(call?.embeds).toBeUndefined();
    expect(call?.content).toContain("Manage Messages");
  });

  it("works in DMs (no guild)", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    const msg = createMockMessage({ guildId: null });
    await sendHelpMessage(msg);
    expect(msg.reply).toHaveBeenCalled();
  });
});

describe("catalog", () => {
  it("has the expected categories", () => {
    expect(CATEGORY_ORDER).toContain("images");
    expect(CATEGORY_ORDER).toContain("whitelist");
    expect(CATEGORY_ORDER).toContain("channels");
    expect(CATEGORY_ORDER).toContain("moderation");
    expect(CATEGORY_ORDER).toContain("apps");
    expect(CATEGORY_ORDER).toContain("system");
  });

  it("getCatalog returns the full catalog per language", () => {
    const es = getCatalog("es");
    const en = getCatalog("en");
    expect(es.length).toBe(CATEGORY_ORDER.length);
    expect(en.length).toBe(CATEGORY_ORDER.length);
    expect(es[0].id).toBe(en[0].id);
  });

  it("getCategory returns the category by id", () => {
    expect(getCategory("es", "images")?.name).toBe("Imágenes");
    expect(getCategory("en", "images")?.name).toBe("Images");
    expect(getCategory("es", "nope")).toBeUndefined();
  });

  it("getSubcommand returns subcommand by ids", () => {
    const sub = getSubcommand("es", "images", "add");
    expect(sub?.name).toBe("images add");
    expect(getSubcommand("es", "images", "missing")).toBeUndefined();
  });

  it("totalSubcommands counts everything", () => {
    const total = totalSubcommands("es");
    const expected = CATEGORY_ORDER.reduce(
      (acc, id) => acc + (getCategory("es", id)?.subcommands.length ?? 0),
      0,
    );
    expect(total).toBe(expected);
    expect(total).toBeGreaterThan(0);
  });

  it("every subcommand has usage and summary", () => {
    for (const cat of getCatalog("es")) {
      for (const sub of cat.subcommands) {
        expect(sub.usage.length).toBeGreaterThan(0);
        expect(sub.summary.length).toBeGreaterThan(0);
        expect(sub.detail.length).toBeGreaterThan(0);
        expect(sub.examples.length).toBeGreaterThan(0);
        expect(sub.permissions.length).toBeGreaterThan(0);
      }
    }
  });

  it("prefixed subcommands include the {prefix} placeholder", () => {
    for (const cat of getCatalog("es")) {
      if (cat.id === "apps") continue;
      for (const sub of cat.subcommands) {
        expect(sub.usage).toMatch(/\{prefix\}/);
      }
    }
  });

  it("es and en have the same structure", () => {
    const es = getCatalog("es");
    const en = getCatalog("en");
    for (let i = 0; i < es.length; i++) {
      expect(es[i].id).toBe(en[i].id);
      expect(es[i].subcommands.length).toBe(en[i].subcommands.length);
      for (let j = 0; j < es[i].subcommands.length; j++) {
        expect(es[i].subcommands[j].id).toBe(en[i].subcommands[j].id);
        expect(es[i].subcommands[j].summary.length).toBeGreaterThan(0);
        expect(en[i].subcommands[j].summary.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("help view builders", () => {
  const prefix = env.DISCORD_PREFIX;
  const userId = "u-1";

  it("builds the home view (es)", () => {
    const view = buildHelpView({ kind: "home" }, "es", prefix, userId);
    expect(view.embeds).toHaveLength(1);
    expect(view.components).toHaveLength(2);
    const json = JSON.stringify(view.embeds[0].toJSON());
    expect(json).toContain("MiduBot");
    expect(json).toContain("🖼️");
  });

  it("builds the home view (en)", () => {
    const view = buildHelpView({ kind: "home" }, "en", prefix, userId);
    const json = JSON.stringify(view.embeds[0].toJSON());
    expect(json).toContain("Help");
    expect(json).toContain("Images");
  });

  it("builds a category view for every category", () => {
    for (const id of CATEGORY_ORDER) {
      const view = buildHelpView({ kind: "cat", id }, "es", prefix, userId);
      expect(view.embeds).toHaveLength(1);
      expect(view.components).toHaveLength(2);
    }
  });

  it("builds a subcommand view for every subcommand", () => {
    for (const cat of getCatalog("es")) {
      for (const sub of cat.subcommands) {
        const view = buildHelpView(
          { kind: "sub", cat: cat.id, id: sub.id },
          "es",
          prefix,
          userId,
        );
        const json = JSON.stringify(view.embeds[0].toJSON());
        expect(json).toContain("📋");
        expect(json).toContain("🔐");
        expect(view.components).toHaveLength(2);
      }
    }
  });

  it("subcommand view substitutes prefix and embeds all fields", () => {
    const view = buildHelpView(
      { kind: "sub", cat: "images", id: "add" },
      "es",
      prefix,
      userId,
    );
    const json = JSON.stringify(view.embeds[0].toJSON());
    expect(json).toContain(`${prefix}images add`);
    expect(json).toContain("a");
    expect(json).toContain("+");
    expect(json).toContain("create");
  });

  it("home view disables home & back buttons", () => {
    const view = buildHelpView({ kind: "home" }, "es", prefix, userId);
    const buttons = view.components[1].toJSON().components as Array<{
      custom_id: string;
      disabled?: boolean;
    }>;
    const home = buttons.find((b) => b.custom_id === homeCustomId(userId));
    const back = buttons.find((b) => b.custom_id.startsWith("help_back"));
    expect(home?.disabled).toBe(true);
    expect(back?.disabled).toBe(true);
  });

  it("subcommand view has back button pointing to its category", () => {
    const view = buildHelpView(
      { kind: "sub", cat: "moderation", id: "linefilter" },
      "es",
      prefix,
      userId,
    );
    const buttons = view.components[1].toJSON().components as Array<{
      custom_id: string;
      disabled?: boolean;
    }>;
    const back = buttons.find((b) => b.custom_id.startsWith("help_back"));
    expect(back?.custom_id).toContain("cat:moderation");
    expect(back?.disabled).toBe(false);
  });

  it("embeds footer mentions the user", () => {
    const view = buildHelpView({ kind: "home" }, "es", prefix, userId);
    const json = view.embeds[0].toJSON();
    expect(json.footer?.text).toContain(`<@${userId}>`);
  });

  it("category select menu has one option per category", () => {
    const view = buildHelpView({ kind: "home" }, "es", prefix, userId);
    const select = view.components[0].toJSON()
      .components[0] as { options: Array<{ value: string }> };
    const values = select.options.map((o) => o.value);
    for (const id of CATEGORY_ORDER) {
      expect(values).toContain(`cat:${id}`);
    }
  });

  it("subcommand select has one option per subcommand in the category", () => {
    const view = buildHelpView(
      { kind: "cat", id: "images" },
      "es",
      prefix,
      userId,
    );
    const select = view.components[0].toJSON()
      .components[0] as { options: Array<{ value: string }> };
    const subs = getCategory("es", "images")!.subcommands;
    expect(select.options.length).toBe(subs.length);
    for (const s of subs) {
      expect(select.options.map((o) => o.value)).toContain(`sub:images:${s.id}`);
    }
  });
});

describe("parseHelpCustomId", () => {
  it("parses base custom ids", () => {
    expect(parseHelpCustomId("help_select").kind).toBe("select");
    expect(parseHelpCustomId("help_home").kind).toBe("home");
    expect(parseHelpCustomId("help_close").kind).toBe("close");
  });

  it("parses user-scoped custom ids", () => {
    expect(parseHelpCustomId("help_select:42")).toMatchObject({
      kind: "select",
      userId: "42",
    });
    expect(parseHelpCustomId("help_home:42")).toMatchObject({
      kind: "home",
      userId: "42",
    });
    expect(parseHelpCustomId("help_close:42")).toMatchObject({
      kind: "close",
      userId: "42",
    });
  });

  it("parses back custom ids with embedded target", () => {
    expect(parseHelpCustomId("help_back:home:42")).toMatchObject({
      kind: "back",
      target: "home",
      userId: "42",
    });
    expect(parseHelpCustomId("help_back:cat:images:42")).toMatchObject({
      kind: "back",
      target: "cat:images",
      userId: "42",
    });
  });

  it("returns other for unknown prefixes", () => {
    expect(parseHelpCustomId("foo:42").kind).toBe("other");
  });
});

describe("resolveViewFromSelect / resolveViewFromTarget", () => {
  it("resolves home", () => {
    expect(resolveViewFromSelect("home")).toEqual({ kind: "home" });
    expect(resolveViewFromTarget("home")).toEqual({ kind: "home" });
  });

  it("resolves cat", () => {
    expect(resolveViewFromSelect("cat:images")).toEqual({
      kind: "cat",
      id: "images",
    });
  });

  it("resolves sub", () => {
    expect(resolveViewFromSelect("sub:images:add")).toEqual({
      kind: "sub",
      cat: "images",
      id: "add",
    });
  });

  it("returns null for unknown categories", () => {
    expect(resolveViewFromSelect("cat:unknown")).toBeNull();
    expect(resolveViewFromSelect("sub:unknown:add")).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(resolveViewFromSelect("garbage")).toBeNull();
    expect(resolveViewFromSelect("sub:images")).toBeNull();
  });
});

describe("custom id builders", () => {
  it("encodes the userId", () => {
    expect(selectCustomId("u-9")).toBe("help_select:u-9");
    expect(homeCustomId("u-9")).toBe("help_home:u-9");
    expect(closeCustomId("u-9")).toBe("help_close:u-9");
  });

  it("encodes back target and userId", () => {
    expect(backCustomId("home", "u-9")).toBe("help_back:home:u-9");
    expect(backCustomId("cat:images", "u-9")).toBe("help_back:cat:images:u-9");
  });
});

describe("isHelpCategoryId", () => {
  it("accepts known ids", () => {
    expect(isHelpCategoryId("images")).toBe(true);
    expect(isHelpCategoryId("apps")).toBe(true);
  });
  it("rejects unknown ids", () => {
    expect(isHelpCategoryId("nope")).toBe(false);
  });
});

describe("command registry", () => {
  it("returns command by name", () => {
    expect(getCommand("version")?.name).toBe("version");
    expect(getCommand("v")?.name).toBe("version");
  });

  it("returns undefined for unknown", () => {
    expect(getCommand("nope")).toBeUndefined();
  });

  it("getCommands returns all", () => {
    const cmds = getCommands();
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.map((c) => c.name)).toContain("images");
    expect(cmds.map((c) => c.name)).toContain("version");
  });

  it("is case-insensitive", () => {
    expect(getCommand("VERSION")?.name).toBe("version");
  });
});
