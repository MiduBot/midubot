import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { AiPromptsService } from "@/features/ai-mod/services/ai-prompts.service";

beforeEach(() => clear());

describe("AiPromptsService.add", () => {
  it("inserts without throwing", async () => {
    await AiPromptsService.add("g1", "nota de contexto");
  });
});
