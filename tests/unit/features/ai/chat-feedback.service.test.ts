import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createMockDb } from "../../../mocks/db";

const { db, setQueryResult, setMutationResult, clear } = createMockDb();
mock.module("@/db/connection", () => ({ db }));

import { ChatFeedbackService } from "@/features/ai/services/chat-feedback.service";

describe("ChatFeedbackService", () => {
  beforeEach(clear);

  it("records response metrics", async () => {
    setMutationResult("insert", undefined);
    await expect(
      ChatFeedbackService.record({
        requestMessageId: "request",
        responseMessageId: "response",
        guildId: "guild",
        channelId: "channel",
        requesterId: "user",
        model: "model",
        latencyMs: 25,
        inputTokens: 10,
        outputTokens: 4,
        finishReason: "stop",
      }),
    ).resolves.toBeUndefined();
  });

  it("only accepts the requester's first rating", async () => {
    setQueryResult("findFirst", {
      requesterId: "requester",
      rating: null,
    });
    setMutationResult("update", { rowsAffected: 1 });
    expect(
      await ChatFeedbackService.rate("request", "other", "up"),
    ).toBe("forbidden");
    expect(
      await ChatFeedbackService.rate("request", "requester", "down"),
    ).toBe("recorded");

    setQueryResult("findFirst", {
      requesterId: "requester",
      rating: "down",
    });
    expect(
      await ChatFeedbackService.rate("request", "requester", "up"),
    ).toBe("already_rated");
  });

  it("rates response message for its requester", async () => {
    setQueryResult("findFirst", {
      requesterId: "user",
      rating: null,
    });
    setMutationResult("update", { rowsAffected: 1 });

    await expect(
      ChatFeedbackService.rateResponse("response", "user", "up"),
    ).resolves.toBe("recorded");
  });

  it("rejects non-requester and duplicate response ratings", async () => {
    setQueryResult("findFirst", {
      requesterId: "other",
      rating: null,
    });
    await expect(
      ChatFeedbackService.rateResponse("response", "user", "down"),
    ).resolves.toBe("forbidden");

    setQueryResult("findFirst", {
      requesterId: "user",
      rating: "up",
    });
    await expect(
      ChatFeedbackService.rateResponse("response", "user", "down"),
    ).resolves.toBe("already_rated");
  });
});
