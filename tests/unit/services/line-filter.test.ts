import { describe, it, expect } from "bun:test";
import {
  LineFilterService,
  type LineFilterConfig,
} from "@/features/line-filter/services/line-filter.service";
import type { Message } from "discord.js";

function buildMessage(opts: {
  content: string;
  createdTimestamp?: number;
  joinedTimestamp?: number | null;
  roleCount?: number;
  attachmentCount?: number;
}): Message {
  const now = Date.now();
  return {
    content: opts.content,
    author: {
      createdTimestamp: opts.createdTimestamp ?? now - 30 * 86400000,
    },
    member: opts.joinedTimestamp === null
      ? null
      : {
          joinedTimestamp: opts.joinedTimestamp ?? now - 30 * 86400000,
          roles: {
            cache: { size: opts.roleCount ?? 0 },
          },
        },
    attachments: { size: opts.attachmentCount ?? 0 },
  } as unknown as Message;
}

describe("LineFilterService.computeRiskScore", () => {
  const baseConfig: LineFilterConfig = {
    enabled: true,
    threshold: 20,
    riskLimit: 3,
    exemptChannels: new Set(),
  };

  it("returns 0 when lines are below threshold", async () => {
    const message = buildMessage({ content: "one\ntwo\nthree" });
    const result = await LineFilterService.computeRiskScore(message, baseConfig);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain("below_threshold");
  });

  it("penalizes long messages without code blocks or doc URLs", async () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i}`).join("\n");
    const message = buildMessage({ content: lines });
    const result = await LineFilterService.computeRiskScore(message, baseConfig);
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons).toContain("lines_exceeded");
    expect(result.reasons).toContain("no_code_block");
    expect(result.reasons).toContain("no_doc_url");
  });

  it("reduces score for messages with code blocks", async () => {
    const lines = Array.from({ length: 25 }, () => "code").join("\n");
    const withCode = buildMessage({ content: "```\n" + lines + "\n```" });
    const withoutCode = buildMessage({ content: lines });

    const r1 = await LineFilterService.computeRiskScore(withCode, baseConfig);
    const r2 = await LineFilterService.computeRiskScore(withoutCode, baseConfig);
    expect(r1.score).toBeLessThan(r2.score);
  });

  it("reduces score for messages with doc URLs", async () => {
    const lines = Array.from({ length: 25 }, () => "text").join("\n");
    const withDoc = buildMessage({
      content: lines + "\nhttps://docs.example.com/guide",
    });
    const withoutDoc = buildMessage({ content: lines });

    const r1 = await LineFilterService.computeRiskScore(withDoc, baseConfig);
    const r2 = await LineFilterService.computeRiskScore(withoutDoc, baseConfig);
    expect(r1.score).toBeLessThan(r2.score);
  });

  it("boosts score for suspicious keywords", async () => {
    const lines = Array.from({ length: 25 }, () => "trabajo remoto").join("\n");
    const message = buildMessage({ content: lines });
    const result = await LineFilterService.computeRiskScore(message, baseConfig);
    expect(result.reasons).toContain("suspicious_keywords");
  });

  it("boosts score for new accounts", async () => {
    const lines = Array.from({ length: 25 }, () => "x").join("\n");
    const newAccount = buildMessage({
      content: lines,
      createdTimestamp: Date.now() - 2 * 86400000,
    });
    const oldAccount = buildMessage({
      content: lines,
      createdTimestamp: Date.now() - 60 * 86400000,
    });

    const r1 = await LineFilterService.computeRiskScore(newAccount, baseConfig);
    const r2 = await LineFilterService.computeRiskScore(oldAccount, baseConfig);
    expect(r1.score).toBeGreaterThan(r2.score);
    expect(r1.reasons).toContain("new_account");
  });

  it("boosts score for recent joiners", async () => {
    const lines = Array.from({ length: 25 }, () => "x").join("\n");
    const recent = buildMessage({
      content: lines,
      joinedTimestamp: Date.now() - 1 * 86400000,
    });
    const veteran = buildMessage({
      content: lines,
      joinedTimestamp: Date.now() - 30 * 86400000,
    });

    const r1 = await LineFilterService.computeRiskScore(recent, baseConfig);
    const r2 = await LineFilterService.computeRiskScore(veteran, baseConfig);
    expect(r1.score).toBeGreaterThan(r2.score);
    expect(r1.reasons).toContain("recent_joiner");
  });

  it("boosts score for members without roles", async () => {
    const lines = Array.from({ length: 25 }, () => "x").join("\n");
    const noRoles = buildMessage({ content: lines, roleCount: 0 });
    const withRoles = buildMessage({ content: lines, roleCount: 3 });

    const r1 = await LineFilterService.computeRiskScore(noRoles, baseConfig);
    const r2 = await LineFilterService.computeRiskScore(withRoles, baseConfig);
    expect(r1.score).toBeGreaterThan(r2.score);
    expect(r1.reasons).toContain("no_roles");
  });
});
