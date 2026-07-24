import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

const mockModActionService = {
  logAction: mock(async () => undefined),
  getHistory: mock(async () => []),
  getStats: mock(async () => []),
  getTopTargets: mock(async () => []),
  getTotalSince: mock(async () => 0),
};

const mockModNotesService = {
  addNote: mock(async () => ({ id: 1 })),
  getNotes: mock(async () => []),
  removeNote: mock(async () => true),
  countNotes: mock(async () => 0),
};

mock.module("@/features/mod-actions/services/mod-action.service", () => ({
  ModActionService: mockModActionService,
}));
mock.module("@/features/mod-actions/services/mod-notes.service", () => ({
  ModNotesService: mockModNotesService,
}));

import { handleNoteCommand } from "@/features/mod-actions/commands/note.command";
import { handleHistoryCommand } from "@/features/mod-actions/commands/history.command";
import { handleStatsCommand } from "@/features/mod-actions/commands/stats.command";
import { createMockMessage } from "../../mocks/discord";
import { es } from "@/i18n/es";

const PREFIX = "m!";

describe("handleNoteCommand", () => {
  beforeEach(() => {
    appCache.clear();
    setQueryResult("findFirst", { language: "es" });
    mockModNotesService.addNote.mockClear();
    mockModNotesService.getNotes.mockClear();
    mockModNotesService.removeNote.mockClear();
  });

  it("shows usage when no subcommand", async () => {
    const msg = createMockMessage({ content: "m!note" });
    await handleNoteCommand(msg, [], PREFIX);
    expect(msg.reply).toHaveBeenCalledWith(
      es.mod_actions.note_usage.replace("{prefix}", PREFIX),
    );
  });

  it("adds note for mentioned user", async () => {
    mockModNotesService.addNote.mockResolvedValueOnce({ id: 42 } as any);
    const msg = createMockMessage({ content: "m!note add <@123456789012345678> bad behavior" });
    await handleNoteCommand(msg, ["add", "<@123456789012345678>", "bad", "behavior"], PREFIX);
    expect(mockModNotesService.addNote).toHaveBeenCalledWith(
      "g1",
      "123456789012345678",
      msg.author.id,
      "bad behavior",
    );
    expect(msg.reply).toHaveBeenCalled();
  });

  it("rejects add without content", async () => {
    const msg = createMockMessage({});
    await handleNoteCommand(msg, ["add", "<@123456789012345678>"], PREFIX);
    expect(msg.reply).toHaveBeenCalledWith(es.mod_actions.note_empty);
  });

  it("lists notes for user", async () => {
    mockModNotesService.getNotes.mockResolvedValueOnce([
      { id: 1, authorId: "mod1", content: "warned", createdAt: new Date() },
    ] as any);
    const msg = createMockMessage({});
    await handleNoteCommand(msg, ["list", "123456789012345678"], PREFIX);
    expect(msg.reply).toHaveBeenCalled();
    const call = (msg.reply as any).mock.calls[0][0];
    expect(call.embeds[0].title).toContain("123456789012345678");
  });

  it("shows empty when no notes", async () => {
    mockModNotesService.getNotes.mockResolvedValueOnce([]);
    const msg = createMockMessage({});
    await handleNoteCommand(msg, ["list", "123456789012345678"], PREFIX);
    expect(msg.reply).toHaveBeenCalledWith(
      es.mod_actions.note_none.replace("{user}", "123456789012345678"),
    );
  });

  it("removes note by id", async () => {
    mockModNotesService.removeNote.mockResolvedValueOnce(true);
    const msg = createMockMessage({});
    await handleNoteCommand(msg, ["remove", "5"], PREFIX);
    expect(mockModNotesService.removeNote).toHaveBeenCalledWith(5, "g1");
    expect(msg.reply).toHaveBeenCalledWith(es.mod_actions.note_removed);
  });

  it("reports not found on bad remove", async () => {
    mockModNotesService.removeNote.mockResolvedValueOnce(false);
    const msg = createMockMessage({});
    await handleNoteCommand(msg, ["remove", "999"], PREFIX);
    expect(msg.reply).toHaveBeenCalledWith(es.mod_actions.note_not_found);
  });
});

describe("handleHistoryCommand", () => {
  beforeEach(() => {
    appCache.clear();
    setQueryResult("findFirst", { language: "es" });
    mockModActionService.getHistory.mockClear();
    mockModNotesService.countNotes.mockClear();
  });

  it("shows usage without user arg", async () => {
    const msg = createMockMessage({});
    await handleHistoryCommand(msg, [], PREFIX);
    expect(msg.reply).toHaveBeenCalledWith(
      es.mod_actions.history_usage.replace("{prefix}", PREFIX),
    );
  });

  it("shows empty when no history", async () => {
    mockModActionService.getHistory.mockResolvedValueOnce([]);
    mockModNotesService.countNotes.mockResolvedValueOnce(0);
    const msg = createMockMessage({});
    await handleHistoryCommand(msg, ["<@123456789012345678>"], PREFIX);
    expect(msg.reply).toHaveBeenCalledWith(
      es.mod_actions.history_empty.replace("{user}", "123456789012345678"),
    );
  });

  it("shows history embed with actions and notes", async () => {
    mockModActionService.getHistory.mockResolvedValueOnce([
      { id: 1, actionType: "puff", executorId: "mod1", createdAt: new Date(), reason: "spam" },
    ] as any);
    mockModNotesService.getNotes.mockResolvedValueOnce([
      { id: 1, authorId: "mod2", content: "first note", createdAt: new Date() } as any,
      { id: 2, authorId: "mod3", content: "second note", createdAt: new Date() } as any,
    ]);
    const msg = createMockMessage({});
    await handleHistoryCommand(msg, ["123456789012345678"], PREFIX);
    const call = (msg.reply as any).mock.calls[0][0];
    expect(call.embeds[0].title).toContain("123456789012345678");
    expect(call.embeds[0].description).toContain("puff");
    expect(call.embeds[0].description).toContain("### Notas");
    expect(call.embeds[0].description).toContain("📝");
  });
});

describe("handleStatsCommand", () => {
  beforeEach(() => {
    appCache.clear();
    setQueryResult("findFirst", { language: "es" });
    mockModActionService.getStats.mockClear();
    mockModActionService.getTopTargets.mockClear();
    mockModActionService.getTotalSince.mockClear();
  });

  it("shows stats embed", async () => {
    mockModActionService.getStats.mockResolvedValueOnce([
      { actionType: "puff", total: 5 },
    ] as any);
    mockModActionService.getTopTargets.mockResolvedValueOnce([
      { targetUserId: "u1", total: 3 },
    ] as any);
    mockModActionService.getTotalSince.mockResolvedValue(10);
    const msg = createMockMessage({});
    await handleStatsCommand(msg, [], PREFIX);
    const call = (msg.reply as any).mock.calls[0][0];
    expect(call.embeds[0].title).toBe(es.mod_actions.stats_title);
    expect(call.embeds[0].fields[0].value).toContain("puff");
  });
});
