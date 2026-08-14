import { describe, it, expect } from "bun:test";
import { shouldRespond } from "@/features/ai/handlers/chatbot.handler";
import {
  CHATBOT_SILENCE_MS,
  CHATBOT_STICKY_MS,
} from "@/features/ai/constants";
import type { ShouldRespondInput } from "@/features/ai/handlers/chatbot.handler";

const now = 1_000_000_000;

function input(overrides: Partial<ShouldRespondInput> = {}): ShouldRespondInput {
  return {
    enabled: true,
    isAiChannel: false,
    mentionedBot: false,
    replyToBot: false,
    mentionsModRole: false,
    ignored: false,
    lastHumanMessageAt: now - 60_000,
    lastBotReplyAt: null,
    lastBotReplyUserId: null,
    authorId: "u1",
    now,
    ...overrides,
  };
}

describe("shouldRespond", () => {
  it("never responds when disabled", () => {
    expect(
      shouldRespond(input({ enabled: false, mentionedBot: true, isAiChannel: true })),
    ).toBe(false);
  });

  it("skips when a mod role is mentioned", () => {
    expect(shouldRespond(input({ mentionedBot: true, mentionsModRole: true }))).toBe(
      false,
    );
  });

  it("skips ignored channels unless mentioned, replied, or it is the AI channel", () => {
    expect(shouldRespond(input({ ignored: true }))).toBe(false);
    expect(shouldRespond(input({ ignored: true, mentionedBot: true }))).toBe(true);
    expect(shouldRespond(input({ ignored: true, replyToBot: true }))).toBe(true);
    expect(
      shouldRespond(
        input({
          ignored: true,
          isAiChannel: true,
          lastHumanMessageAt: now - CHATBOT_SILENCE_MS - 1,
        }),
      ),
    ).toBe(true);
  });

  it("responds to a bot mention in any channel", () => {
    expect(shouldRespond(input({ mentionedBot: true }))).toBe(true);
  });

  it("responds to a reply to the bot in any channel", () => {
    expect(shouldRespond(input({ replyToBot: true }))).toBe(true);
  });

  it("does not jump into other channels without mention or reply", () => {
    expect(shouldRespond(input({ isAiChannel: false }))).toBe(false);
  });

  it("breaks silence in the AI channel", () => {
    expect(
      shouldRespond(
        input({
          isAiChannel: true,
          lastHumanMessageAt: now - CHATBOT_SILENCE_MS - 1,
        }),
      ),
    ).toBe(true);
    expect(
      shouldRespond(input({ isAiChannel: true, lastHumanMessageAt: null })),
    ).toBe(true);
  });

  it("stays quiet in the AI channel when people are talking", () => {
    expect(
      shouldRespond(
        input({
          isAiChannel: true,
          lastHumanMessageAt: now - 60_000,
        }),
      ),
    ).toBe(false);
  });

  it("sticks to the same user in the AI channel for a few minutes", () => {
    expect(
      shouldRespond(
        input({
          isAiChannel: true,
          lastHumanMessageAt: now - 10_000,
          lastBotReplyAt: now - 30_000,
          lastBotReplyUserId: "u1",
          authorId: "u1",
        }),
      ),
    ).toBe(true);
    expect(
      shouldRespond(
        input({
          isAiChannel: true,
          lastHumanMessageAt: now - 10_000,
          lastBotReplyAt: now - 30_000,
          lastBotReplyUserId: "u1",
          authorId: "u2",
        }),
      ),
    ).toBe(false);
    expect(
      shouldRespond(
        input({
          isAiChannel: true,
          lastHumanMessageAt: now - 10_000,
          lastBotReplyAt: now - CHATBOT_STICKY_MS - 1,
          lastBotReplyUserId: "u1",
          authorId: "u1",
        }),
      ),
    ).toBe(false);
  });
});
