import { describe, it, expect, mock, afterEach } from "bun:test";

const mockEnv = {
  AI_API_URL: "https://ai.test/v1",
  AI_API_KEY: "test-key",
  AI_MODEL: "deepseek-v4-flash",
  AI_CHAT_MODEL: "chat-model",
};

mock.module("@/config/env", () => ({ env: mockEnv }));

let generateTextImpl = async () => ({ text: "hello" });
const generateTextMock = mock(async (...args: unknown[]) => generateTextImpl(...args));
mock.module("ai", () => ({ generateText: generateTextMock }));

const providerModelMock = mock((modelId: string) => ({ modelId }));
const createOpenAICompatibleMock = mock(() => providerModelMock);
mock.module("@ai-sdk/openai-compatible", () => ({ createOpenAICompatible: createOpenAICompatibleMock }));

import { AIClientService } from "@/features/ai-mod/services/ai-client.service";

describe("AIClientService.chat", () => {
  afterEach(() => {
    generateTextImpl = async () => ({ text: "hello" });
    generateTextMock.mockClear?.();
    createOpenAICompatibleMock.mockClear?.();
    providerModelMock.mockClear?.();
  });

  it("returns the generated text on a good response", async () => {
    generateTextImpl = async () => ({ text: "hello" });
    const raw = await AIClientService.chat("sys", "usr");
    expect(raw).toBe("hello");
  });

  it("returns null when generateText throws", async () => {
    generateTextImpl = async () => {
      throw new Error("provider error");
    };
    const raw = await AIClientService.chat("sys", "usr");
    expect(raw).toBeNull();
  });

  it("returns null when env is unset", async () => {
    const saved = mockEnv.AI_API_URL;
    mockEnv.AI_API_URL = "";
    const raw = await AIClientService.chat("sys", "usr");
    expect(raw).toBeNull();
    mockEnv.AI_API_URL = saved;
  });

  it("returns the generated text even when the text is empty", async () => {
    generateTextImpl = async () => ({ text: "" });
    const raw = await AIClientService.chat("sys", "usr");
    expect(raw).toBe("");
  });

  it("chatMessages passes temperature and history", async () => {
    generateTextImpl = async () => ({ text: "hey" });
    const raw = await AIClientService.chatMessages(
      "sys",
      [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
      { temperature: 0.9, timeoutMs: 25_000 },
    );
    expect(raw).toBe("hey");
    const arg = generateTextMock.mock.calls.at(-1)?.[0] as {
      temperature: number;
      messages: unknown[];
    };
    expect(arg.temperature).toBe(0.9);
    expect(arg.messages).toHaveLength(3);
  });

  it("normalizes a full chat-completions URL and returns metrics", async () => {
    mockEnv.AI_API_URL = "https://ai.test/v1/chat/completions";
    generateTextImpl = async () => ({
      text: "hey",
      usage: { inputTokens: 10, outputTokens: 3 },
      finishReason: "stop",
    });
    const result = await AIClientService.chatMessagesDetailed(
      "sys",
      [{ role: "user", content: "hola" }],
      { maxOutputTokens: 123 },
    );
    expect(result?.model).toBe("chat-model");
    expect(result?.inputTokens).toBe(10);
    expect(result?.outputTokens).toBe(3);
    expect(result?.finishReason).toBe("stop");
    const providerOptions = createOpenAICompatibleMock.mock.calls.at(-1)?.[0] as {
      baseURL: string;
    };
    expect(providerOptions.baseURL).toBe("https://ai.test/v1");
    const generateOptions = generateTextMock.mock.calls.at(-1)?.[0] as {
      maxOutputTokens: number;
      maxRetries: number;
    };
    expect(generateOptions.maxOutputTokens).toBe(123);
    expect(generateOptions.maxRetries).toBe(1);
    mockEnv.AI_API_URL = "https://ai.test/v1";
  });

  it("chat keeps temperature 0", async () => {
    generateTextImpl = async () => ({ text: "x" });
    await AIClientService.chat("sys", "usr");
    const arg = generateTextMock.mock.calls.at(-1)?.[0] as { temperature: number };
    expect(arg.temperature).toBe(0);
  });

  it("limits concurrent requests to three", async () => {
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    generateTextImpl = async () => {
      active++;
      maximum = Math.max(maximum, active);
      await gate;
      active--;
      return { text: "ok" };
    };

    const requests = Array.from({ length: 5 }, () =>
      AIClientService.chatMessagesDetailed(
        "sys",
        [{ role: "user", content: "hola" }],
        { timeoutMs: 1_000 },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(active).toBe(3);
    release();
    await Promise.all(requests);
    expect(maximum).toBe(3);
  });
});
