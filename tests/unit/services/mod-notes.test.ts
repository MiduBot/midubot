import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { ModNotesService } from "@/features/mod-actions";

describe("ModNotesService", () => {
  beforeEach(() => {
    clear();
  });

  describe("addNote", () => {
    it("inserts and returns note", async () => {
      const note = { id: 1, guildId: "g1", targetUserId: "u1", authorId: "mod1", content: "test", createdAt: new Date() };
      setMutationResult("insert", [note]);
      const result = await ModNotesService.addNote("g1", "u1", "mod1", "test");
      expect(result).toEqual(note);
    });
  });

  describe("getNotes", () => {
    it("returns notes", async () => {
      const notes = [
        { id: 1, content: "note1", createdAt: new Date() },
        { id: 2, content: "note2", createdAt: new Date() },
      ];
      setQueryResult("findMany", notes);
      const result = await ModNotesService.getNotes("g1", "u1");
      expect(result).toEqual(notes);
    });

    it("returns empty when no notes", async () => {
      setQueryResult("findMany", []);
      const result = await ModNotesService.getNotes("g1", "u1");
      expect(result).toEqual([]);
    });
  });

  describe("removeNote", () => {
    it("returns true when deleted", async () => {
      setMutationResult("delete", { rowsAffected: 1 });
      expect(await ModNotesService.removeNote(1, "g1")).toBe(true);
    });

    it("returns false when not found", async () => {
      setMutationResult("delete", { rowsAffected: 0 });
      expect(await ModNotesService.removeNote(999, "g1")).toBe(false);
    });
  });

  describe("countNotes", () => {
    it("returns count", async () => {
      setMutationResult("select", [{ total: 5 }]);
      expect(await ModNotesService.countNotes("g1", "u1")).toBe(5);
    });

    it("returns 0 when empty", async () => {
      setMutationResult("select", []);
      expect(await ModNotesService.countNotes("g1", "u1")).toBe(0);
    });
  });
});
