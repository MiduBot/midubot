import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { AiChatConfigService } from "@/features/ai/services/ai-chat-config.service";

describe("AiChatConfigService", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  describe("getConfig", () => {
    it("returns disabled when no row", async () => {
      setQueryResult("findFirst", null);
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: false,
        channelId: null,
        mode: "ambient",
      });
    });

    it("returns stored values and caches them", async () => {
      setQueryResult("findFirst", { enabled: true, channelId: "c1" });
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: true,
        channelId: "c1",
        mode: "ambient",
      });
      setQueryResult("findFirst", { enabled: false, channelId: "other" });
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: true,
        channelId: "c1",
        mode: "ambient",
      });
    });
  });

  describe("setEnabled", () => {
    it("inserts when no row", async () => {
      setQueryResult("findFirst", null);
      setMutationResult("insert", undefined);
      await AiChatConfigService.setEnabled("g1", true);
      setQueryResult("findFirst", { enabled: true, channelId: null });
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: true,
        channelId: null,
        mode: "ambient",
      });
    });

    it("updates existing row and busts cache", async () => {
      setQueryResult("findFirst", { enabled: false, channelId: "c1" });
      await AiChatConfigService.getConfig("g1");
      setMutationResult("update", undefined);
      await AiChatConfigService.setEnabled("g1", true);
      setQueryResult("findFirst", { enabled: true, channelId: "c1" });
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: true,
        channelId: "c1",
        mode: "ambient",
      });
    });
  });

  describe("setChannel", () => {
    it("inserts disabled with channel when no row", async () => {
      setQueryResult("findFirst", null);
      setMutationResult("insert", undefined);
      await AiChatConfigService.setChannel("g1", "c9");
      setQueryResult("findFirst", { enabled: false, channelId: "c9" });
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: false,
        channelId: "c9",
        mode: "ambient",
      });
    });
  });

  describe("clearChannel", () => {
    it("no-ops when no row", async () => {
      setQueryResult("findFirst", null);
      await AiChatConfigService.clearChannel("g1");
    });

    it("clears channel and busts cache", async () => {
      setQueryResult("findFirst", { enabled: true, channelId: "c1" });
      await AiChatConfigService.getConfig("g1");
      setMutationResult("update", undefined);
      await AiChatConfigService.clearChannel("g1");
      setQueryResult("findFirst", { enabled: true, channelId: null });
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: true,
        channelId: null,
        mode: "ambient",
      });
    });
  });

  describe("setMode", () => {
    it("stores mention-only mode and busts cache", async () => {
      setQueryResult("findFirst", { enabled: true, channelId: "c1" });
      await AiChatConfigService.getConfig("g1");
      setMutationResult("update", undefined);
      await AiChatConfigService.setMode("g1", "mentions");
      setQueryResult("findFirst", {
        enabled: true,
        channelId: "c1",
        mode: "mentions",
      });
      expect(await AiChatConfigService.getConfig("g1")).toEqual({
        enabled: true,
        channelId: "c1",
        mode: "mentions",
      });
    });
  });
});
