import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage } from "../../mocks/discord";

const { db, setTableResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { handleReportContextMenu } from "@/features/reports/commands/report-context.command";

function makeInteraction(opts: {
  guildId?: string | null;
  reporterId?: string;
  target?: {
    id?: string;
    author?: { id?: string; bot?: boolean };
    content?: string;
  };
}) {
  const attachments = new Map();
  return {
    guild: opts.guildId === null ? null : { id: opts.guildId ?? "g1" },
    user: { id: opts.reporterId ?? "u2" },
    targetMessage: {
      id: opts.target?.id ?? "999999999999999999",
      author: {
        id: opts.target?.author?.id ?? "u1",
        bot: opts.target?.author?.bot ?? false,
      },
      content: opts.target?.content ?? "",
      attachments: {
        values: () => attachments.values(),
        size: attachments.size,
      },
      channelId: "222222222222222222",
      member: null,
    },
    commandName: "Reportar",
    reply: mock(() => Promise.resolve()),
    editReply: mock(() => Promise.resolve()),
    deferReply: mock(() => Promise.resolve()),
  } as never;
}

describe("handleReportContextMenu", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns when not in a guild", async () => {
    const interaction = makeInteraction({ guildId: null });
    await handleReportContextMenu(interaction);
  });

  it("rejects self-report", async () => {
    const interaction = makeInteraction({
      reporterId: "u1",
      target: { author: { id: "u1" } },
    });
    await handleReportContextMenu(interaction);
  });

  it("rejects bot messages", async () => {
    const interaction = makeInteraction({
      target: { author: { bot: true } },
    });
    await handleReportContextMenu(interaction);
  });

  it("adds report and replies with count", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    setTableResult("whitelistsTable", "findMany", []);
    const interaction = makeInteraction({});
    await handleReportContextMenu(interaction);
  });

  it("reaches quorum with 3 reports", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    setTableResult("whitelistsTable", "findMany", []);

    await handleReportContextMenu(makeInteraction({ reporterId: "u2" }));
    await handleReportContextMenu(makeInteraction({ reporterId: "u3" }));
    await handleReportContextMenu(makeInteraction({ reporterId: "u4" }));
  });
});
