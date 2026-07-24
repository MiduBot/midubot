import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleHelpSelect, handleHelpButton } from "@/commands/help/handler";
import {
  selectCustomId,
  homeCustomId,
  backCustomId,
  closeCustomId,
} from "@/commands/help/view";

const ownerId = "owner-1";
const otherId = "other-1";

function makeSelectInteraction(opts: {
  userId?: string;
  value?: string;
  ownerId?: string;
}) {
  return {
    user: { id: opts.userId ?? ownerId },
    guild: { id: "g1" },
    customId: selectCustomId(opts.ownerId ?? ownerId),
    values: [opts.value ?? "cat:images"],
    replied: false,
    deferred: false,
    reply: mock(() => Promise.resolve()),
    update: mock(() => Promise.resolve()),
    followUp: mock(() => Promise.resolve()),
  } as never;
}

function makeButtonInteraction(opts: {
  kind: "home" | "close" | "back";
  userId?: string;
  target?: string;
}) {
  let customId: string;
  if (opts.kind === "home") customId = homeCustomId(ownerId);
  else if (opts.kind === "close") customId = closeCustomId(ownerId);
  else customId = backCustomId(opts.target ?? "home", ownerId);
  return {
    user: { id: opts.userId ?? ownerId },
    guild: { id: "g1" },
    customId,
    replied: false,
    deferred: false,
    reply: mock(() => Promise.resolve()),
    update: mock(() => Promise.resolve()),
    followUp: mock(() => Promise.resolve()),
  } as never;
}

describe("handleHelpSelect", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
    setTableResult("guildConfigsTable", "findFirst", null);
  });

  it("updates the message to the selected category", async () => {
    const i = makeSelectInteraction({ value: "cat:apps" });
    await handleHelpSelect(i);
    expect(i.update).toHaveBeenCalled();
    const call = (i.update as ReturnType<typeof mock>).mock.calls[0]?.[0] as {
      embeds?: unknown[];
      components?: unknown[];
    };
    expect(call?.embeds?.length).toBe(1);
    expect(call?.components?.length).toBe(2);
  });

  it("updates the message to a subcommand view", async () => {
    const i = makeSelectInteraction({ value: "sub:images:add" });
    await handleHelpSelect(i);
    expect(i.update).toHaveBeenCalled();
  });

  it("updates the message back to home", async () => {
    const i = makeSelectInteraction({ value: "home" });
    await handleHelpSelect(i);
    expect(i.update).toHaveBeenCalled();
  });

  it("rejects when user is not the owner", async () => {
    const i = makeSelectInteraction({ userId: otherId });
    await handleHelpSelect(i);
    expect(i.reply).toHaveBeenCalled();
    expect(i.update).not.toHaveBeenCalled();
  });

  it("ignores unknown values", async () => {
    const i = makeSelectInteraction({ value: "garbage" });
    await handleHelpSelect(i);
    expect(i.update).not.toHaveBeenCalled();
    expect(i.reply).not.toHaveBeenCalled();
  });
});

describe("handleHelpButton", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
    setTableResult("guildConfigsTable", "findFirst", null);
  });

  it("home button updates the view to home", async () => {
    const i = makeButtonInteraction({ kind: "home" });
    await handleHelpButton(i);
    expect(i.update).toHaveBeenCalled();
  });

  it("close button empties the message", async () => {
    const i = makeButtonInteraction({ kind: "close" });
    await handleHelpButton(i);
    expect(i.update).toHaveBeenCalled();
    const call = (i.update as ReturnType<typeof mock>).mock.calls[0]?.[0] as {
      embeds?: unknown[];
      components?: unknown[];
    };
    expect(call?.embeds).toEqual([]);
    expect(call?.components).toEqual([]);
  });

  it("back button updates the view to its target category", async () => {
    const i = makeButtonInteraction({
      kind: "back",
      target: "cat:moderation",
    });
    await handleHelpButton(i);
    expect(i.update).toHaveBeenCalled();
  });

  it("back button with unknown target falls back to home", async () => {
    const i = makeButtonInteraction({ kind: "back", target: "garbage" });
    await handleHelpButton(i);
    expect(i.update).toHaveBeenCalled();
  });

  it("rejects button from a different user", async () => {
    const i = makeButtonInteraction({ kind: "home", userId: otherId });
    await handleHelpButton(i);
    expect(i.reply).toHaveBeenCalled();
    expect(i.update).not.toHaveBeenCalled();
  });
});
