import { beforeEach, describe, expect, it, mock } from "bun:test";

const rateResponseMock = mock(async () => "recorded" as const);
mock.module("@/features/ai/services/chat-feedback.service", () => ({
  ChatFeedbackService: { rateResponse: rateResponseMock },
}));

import { handleChatFeedbackReaction } from "@/features/ai/handlers/chat-feedback-reaction.handler";

describe("handleChatFeedbackReaction", () => {
  beforeEach(() => rateResponseMock.mockClear());

  it("records thumbs-up reaction", async () => {
    await handleChatFeedbackReaction(
      { emoji: { name: "👍" }, message: { id: "response" } } as never,
      { id: "user", bot: false } as never,
    );

    expect(rateResponseMock).toHaveBeenCalledWith("response", "user", "up");
  });

  it("records thumbs-down reaction", async () => {
    await handleChatFeedbackReaction(
      { emoji: { name: "👎" }, message: { id: "response" } } as never,
      { id: "user", bot: false } as never,
    );

    expect(rateResponseMock).toHaveBeenCalledWith("response", "user", "down");
  });

  it("ignores unsupported emojis and bot reactions", async () => {
    await handleChatFeedbackReaction(
      { emoji: { name: "❤️" }, message: { id: "response" } } as never,
      { id: "user", bot: false } as never,
    );
    await handleChatFeedbackReaction(
      { emoji: { name: "👎" }, message: { id: "response" } } as never,
      { id: "bot", bot: true } as never,
    );

    expect(rateResponseMock).not.toHaveBeenCalled();
  });
});
