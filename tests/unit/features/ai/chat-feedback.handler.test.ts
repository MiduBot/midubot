import { describe, expect, it, mock } from "bun:test";

const rateMock = mock(async () => "recorded" as const);
mock.module("@/features/ai/services/chat-feedback.service", () => ({
  ChatFeedbackService: { rate: rateMock },
}));
mock.module("@/features/language", () => ({
  LanguageService: { getLanguage: mock(async () => "es") },
}));

import { handleChatFeedbackButton } from "@/features/ai/handlers/chat-feedback.handler";

describe("handleChatFeedbackButton", () => {
  it("records the rating and removes the buttons", async () => {
    const edit = mock(async () => {});
    const deferReply = mock(async () => {});
    const editReply = mock(async () => {});
    await handleChatFeedbackButton({
      customId: "chatfb_request_up",
      user: { id: "user" },
      guildId: "guild",
      deferReply,
      editReply,
      message: { edit },
    } as never);
    expect(rateMock).toHaveBeenCalledWith("request", "user", "up");
    expect(deferReply).toHaveBeenCalled();
    expect(editReply).toHaveBeenCalled();
    expect(edit).toHaveBeenCalledWith({ components: [] });
  });
});
