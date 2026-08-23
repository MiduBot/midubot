import { beforeEach, describe, expect, it, mock } from "bun:test";

let configRow: { mode: "shadow" | "assisted" | "autonomous" } | undefined;
const insertedValues: unknown[] = [];
const conflictConfigs: unknown[] = [];

const db = {
  query: {
    moderationFeatureConfigsTable: {
      findFirst: () => Promise.resolve(configRow),
    },
  },
  insert: () => ({
    values: (values: unknown) => {
      insertedValues.push(values);
      return {
        onConflictDoUpdate: (config: unknown) => {
          conflictConfigs.push(config);
          return Promise.resolve();
        },
      };
    },
  }),
};

mock.module("@/db/connection", () => ({ db }));

import { moderationFeatureConfigsTable } from "@/db/schema";
import { ModerationConfigService } from "@/features/ai-moderation/services/config.service";

beforeEach(() => {
  configRow = undefined;
  insertedValues.length = 0;
  conflictConfigs.length = 0;
});

describe("ModerationConfigService", () => {
  it("defaults missing feature configuration to shadow", async () => {
    expect(await ModerationConfigService.getMode("g1", "ai-mod")).toBe("shadow");
  });

  it("returns the stored mode", async () => {
    configRow = { mode: "autonomous" };
    expect(await ModerationConfigService.getMode("g1", "job-guard")).toBe("autonomous");
  });

  it("upserts the exact guild and feature pair", async () => {
    await ModerationConfigService.setMode("g1", "job-guard", "assisted");

    expect(insertedValues).toEqual([
      {
        guildId: "g1",
        feature: "job-guard",
        mode: "assisted",
        updatedAt: expect.any(Date),
      },
    ]);
    expect(conflictConfigs).toEqual([
      {
        target: [
          moderationFeatureConfigsTable.guildId,
          moderationFeatureConfigsTable.feature,
        ],
        set: { mode: "assisted", updatedAt: expect.any(Date) },
      },
    ]);
  });
});
