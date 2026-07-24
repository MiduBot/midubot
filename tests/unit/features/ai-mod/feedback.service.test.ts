import { describe, it, expect, mock, afterEach } from "bun:test";

mock.module("@/config/env", () => ({
  env: {
    AI_API_URL: "https://ai.test/v1/chat/completions",
    AI_API_KEY: "test-key",
    AI_MODEL: "deepseek-v4-flash",
  },
}));

import { FeedbackService } from "@/features/ai-mod/services/feedback.service";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("FeedbackService.generateAntiFpPrompt", () => {
  it("returns the trimmed note on a good response", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "  Un GitHub sin texto comercial no es autopromo.  " } }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const note = await FeedbackService.generateAntiFpPrompt("mira mi github", 2, 0.8, "selfpromo", "es");
    expect(note).toBe("Un GitHub sin texto comercial no es autopromo.");
  });

  it("returns null on HTTP 500", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const note = await FeedbackService.generateAntiFpPrompt("x", 1, 0.9, "r", "es");
    expect(note).toBeNull();
  });
});
