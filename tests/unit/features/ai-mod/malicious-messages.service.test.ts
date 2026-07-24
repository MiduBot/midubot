import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { MaliciousMessagesService } from "@/features/ai-mod/services/malicious-messages.service";

beforeEach(() => clear());

describe("MaliciousMessagesService.addIfAbsent", () => {
  it("does not insert when content already present", async () => {
    setQueryResult("findFirst", { id: 1, guildId: "g1", content: "x", malicious: true });
    await MaliciousMessagesService.addIfAbsent("g1", "x", true);
  });
  it("inserts when absent", async () => {
    setQueryResult("findFirst", undefined);
    await MaliciousMessagesService.addIfAbsent("g1", "x", true);
  });
});
