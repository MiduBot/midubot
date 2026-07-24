import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../../mocks/db";
import { appCache } from "@/core/cache";

const { db, setQueryResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { LanguageService } from "@/features/language";

describe("LanguageService", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns default 'es' when no config", async () => {
    setQueryResult("findFirst", null);
    const lang = await LanguageService.getLanguage("g1");
    expect(lang).toBe("es");
  });

  it("returns configured language", async () => {
    setQueryResult("findFirst", { language: "en" });
    const lang = await LanguageService.getLanguage("g1");
    expect(lang).toBe("en");
  });

  it("caches the result", async () => {
    setQueryResult("findFirst", { language: "en" });
    await LanguageService.getLanguage("g1");
    setQueryResult("findFirst", { language: "es" });
    expect(await LanguageService.getLanguage("g1")).toBe("en");
  });

  it("setLanguage updates the cache", async () => {
    await LanguageService.setLanguage("g1", "en");
    expect(await LanguageService.getLanguage("g1")).toBe("en");
  });
});
