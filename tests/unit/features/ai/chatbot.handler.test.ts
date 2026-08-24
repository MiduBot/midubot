import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage } from "../../../mocks/discord";

const mockEnv = {
  AI_API_URL: "https://ai.test/v1",
  AI_API_KEY: "test-key",
  AI_MODEL: "deepseek-v4-flash",
  AI_CHAT_VISION_ENABLED: false,
};
mock.module("@/config/env", () => ({ env: mockEnv }));

const configMock = {
  getConfig: mock(async () => ({
    enabled: false,
    channelId: null as string | null,
    mode: "ambient" as const,
  })),
};
const allowMock = {
  canUse: mock(async () => true),
};
function aiResult(text: string) {
  return {
    text,
    model: "chat-model",
    latencyMs: 10,
    inputTokens: 20,
    outputTokens: 5,
    finishReason: "stop",
  };
}
const chatMessagesMock = mock(async () => aiResult("jaja"));
const feedbackRecordMock = mock(async () => {});
const hasRoleMock = mock(async () => false);
const isIgnoredMock = mock(async () => false);

mock.module("@/features/ai/services/ai-chat-config.service", () => ({
  AiChatConfigService: configMock,
}));
mock.module("@/features/ai/services/ai-chat-allow.service", () => ({
  AiChatAllowService: allowMock,
}));
mock.module("@/features/language", () => ({
  LanguageService: { getLanguage: mock(async () => "es") },
}));
mock.module("@/features/ai-mod", () => ({
  AIClientService: { chatMessagesDetailed: chatMessagesMock },
}));
mock.module("@/features/ai/services/chat-feedback.service", () => ({
  ChatFeedbackService: { record: feedbackRecordMock },
}));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({
  ModRoleService: { hasRole: hasRoleMock },
}));
mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: isIgnoredMock,
}));

import {
  handleChatbot,
  resetChatbotMemory,
} from "@/features/ai/handlers/chatbot.handler";

const BOT_ID = "bot1";
const CHANNEL = "222222222222222222";

function makeMsg(opts: {
  id?: string;
  content?: string;
  mentioned?: boolean;
  replyToBot?: boolean;
  roleIds?: string[];
  authorId?: string;
  attachments?: Array<{ url: string; contentType?: string }>;
} = {}) {
  const msg = createMockMessage({
    id: opts.id,
    content: opts.content ?? "hola",
    author: { id: opts.authorId ?? "111111111111111111" },
    channelId: CHANNEL,
    attachments: opts.attachments,
  });
  const mentionsUsers = {
    has: (id: string) => !!opts.mentioned && id === BOT_ID,
  };
  const roleIds = opts.roleIds ?? [];
  Object.assign(msg, {
    client: { user: { id: BOT_ID } },
    createdTimestamp: Date.now(),
    mentions: {
      users: mentionsUsers,
      roles: {
        keys: () => roleIds,
        size: roleIds.length,
      },
      repliedUser: opts.replyToBot ? { id: BOT_ID } : null,
    },
    reference: null,
    member: { displayName: "Ada" },
  });
  Object.assign(msg.channel, {
    sendTyping: mock(async () => {}),
    messages: {
      fetch: mock(async () => {
        const map = new Map();
        map.set(msg.id, msg);
        return map;
      }),
    },
  });
  return msg;
}

describe("handleChatbot", () => {
  beforeEach(() => {
    resetChatbotMemory();
    configMock.getConfig.mockClear();
    allowMock.canUse.mockClear();
    chatMessagesMock.mockClear();
    hasRoleMock.mockClear();
    isIgnoredMock.mockClear();
    configMock.getConfig.mockImplementation(async () => ({
      enabled: false,
      channelId: null,
      mode: "ambient",
    }));
    chatMessagesMock.mockImplementation(async () => aiResult("jaja"));
    feedbackRecordMock.mockClear();
    hasRoleMock.mockImplementation(async () => false);
    isIgnoredMock.mockImplementation(async () => false);
    allowMock.canUse.mockImplementation(async () => true);
    mockEnv.AI_API_URL = "https://ai.test/v1";
    mockEnv.AI_API_KEY = "test-key";
    mockEnv.AI_CHAT_VISION_ENABLED = false;
  });

  it("does nothing when disabled", async () => {
    const msg = makeMsg({ mentioned: true });
    await handleChatbot(msg);
    expect(chatMessagesMock).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it("does nothing when AI env is missing", async () => {
    mockEnv.AI_API_URL = "";
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: CHANNEL,
    }));
    const msg = makeMsg({ mentioned: true });
    await handleChatbot(msg);
    expect(chatMessagesMock).not.toHaveBeenCalled();
  });

  it("replies when mentioned and enabled", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
    }));
    const msg = makeMsg({ mentioned: true });
    const responseEdit = mock(async () => {});
    (msg.reply as unknown as { mockImplementation: (fn: () => Promise<unknown>) => void })
      .mockImplementation(async () => ({ id: "response", edit: responseEdit }));
    await handleChatbot(msg);
    expect(chatMessagesMock).toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalled();
    const payload = (msg.reply as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { content: string; allowedMentions: { parse: string[] } };
    expect(payload.content).toBe("jaja");
    expect(payload.allowedMentions.parse).toEqual([]);
    expect(payload).not.toHaveProperty("components");
    expect(responseEdit).not.toHaveBeenCalled();
    expect(feedbackRecordMock).toHaveBeenCalled();
    const fetch = msg.channel.messages.fetch as unknown as {
      mock: { calls: unknown[][] };
    };
    expect(fetch.mock.calls.at(-1)?.[0]).toEqual({
      limit: 24,
      before: msg.id,
    });
  });

  it("sends image attachments without MIME when vision is enabled", async () => {
    mockEnv.AI_CHAT_VISION_ENABLED = true;
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
      mode: "ambient",
    }));
    const msg = makeMsg({
      mentioned: true,
      attachments: [{ url: "https://cdn.test/screenshot.PNG", contentType: "" }],
    });
    await handleChatbot(msg);
    const messages = chatMessagesMock.mock.calls[0][1] as Array<{
      content: unknown;
    }>;
    expect(
      messages.some(
        (turn) =>
          Array.isArray(turn.content) &&
          turn.content.some((part) => part.type === "image"),
      ),
    ).toBe(true);
  });

  it("keeps the configured channel quiet in mentions mode", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: CHANNEL,
      mode: "mentions",
    }));
    const msg = makeMsg({ content: "buenas" });
    await handleChatbot(msg);
    expect(chatMessagesMock).not.toHaveBeenCalled();
  });

  it("shows a short failure for direct requests", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
      mode: "ambient",
    }));
    chatMessagesMock.mockImplementation(async () => null);
    const msg = makeMsg({ mentioned: true });
    await handleChatbot(msg);
    const payload = (msg.reply as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { content: string };
    expect(payload.content).toContain("No pude responder");
  });

  it("rate-limits repeated direct requests from the same user", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
      mode: "ambient",
    }));
    const first = makeMsg({ id: "r1", mentioned: true, authorId: "same" });
    const second = makeMsg({ id: "r2", mentioned: true, authorId: "same" });
    await handleChatbot(first);
    await handleChatbot(second);
    expect(chatMessagesMock).toHaveBeenCalledTimes(1);
    expect(second.react).not.toHaveBeenCalled();
  });

  it("does not reply when a mod role is mentioned", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
    }));
    hasRoleMock.mockImplementation(async () => true);
    const msg = makeMsg({ mentioned: true, roleIds: ["modrole"] });
    await handleChatbot(msg);
    expect(chatMessagesMock).not.toHaveBeenCalled();
  });

  it("breaks silence in the configured AI channel", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: CHANNEL,
    }));
    const msg = makeMsg({ content: "buenas" });
    await handleChatbot(msg);
    expect(chatMessagesMock).toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalled();
  });

  it("does not jump in when another user talks after the icebreak", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: CHANNEL,
    }));
    const first = makeMsg({ content: "buenas", authorId: "111111111111111111" });
    await handleChatbot(first);
    chatMessagesMock.mockClear();

    const second = makeMsg({ content: "y qué más", authorId: "999999999999999999" });
    await handleChatbot(second);
    expect(chatMessagesMock).not.toHaveBeenCalled();
  });

  it("queues a mention that arrives while a reply is in flight", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
    }));

    let releaseFirst!: (value: ReturnType<typeof aiResult>) => void;
    const firstGate = new Promise<ReturnType<typeof aiResult>>((resolve) => {
      releaseFirst = resolve;
    });
    let started!: () => void;
    const startedP = new Promise<void>((resolve) => {
      started = resolve;
    });

    chatMessagesMock.mockImplementationOnce(async () => {
      started();
      return firstGate;
    });
    chatMessagesMock.mockImplementation(async () => aiResult("luego"));

    const first = makeMsg({ id: "m1", mentioned: true, authorId: "111" });
    const p1 = handleChatbot(first);
    await startedP;

    const second = makeMsg({ id: "m2", mentioned: true, authorId: "222" });
    await handleChatbot(second);
    expect(chatMessagesMock).toHaveBeenCalledTimes(1);
    expect(second.reply).not.toHaveBeenCalled();

    releaseFirst(aiResult("primero"));
    await p1;

    expect(first.reply).toHaveBeenCalled();
    expect(second.reply).toHaveBeenCalled();
    expect(chatMessagesMock).toHaveBeenCalledTimes(2);
  });

  it("does not drop extra mentions while a reply is in flight", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
    }));

    let releaseFirst!: (value: ReturnType<typeof aiResult>) => void;
    const firstGate = new Promise<ReturnType<typeof aiResult>>((resolve) => {
      releaseFirst = resolve;
    });
    let started!: () => void;
    const startedP = new Promise<void>((resolve) => {
      started = resolve;
    });

    chatMessagesMock.mockImplementationOnce(async () => {
      started();
      return firstGate;
    });
    chatMessagesMock.mockImplementation(async () => aiResult("luego"));

    const first = makeMsg({ id: "p1", mentioned: true, authorId: "111" });
    const p1 = handleChatbot(first);
    await startedP;

    const extras = [2, 3, 4, 5].map((n) =>
      makeMsg({ id: `p${n}`, mentioned: true, authorId: String(n) }),
    );
    for (const extra of extras) {
      await handleChatbot(extra);
    }
    expect(chatMessagesMock).toHaveBeenCalledTimes(1);

    releaseFirst(aiResult("primero"));
    await p1;

    expect(first.reply).toHaveBeenCalled();
    for (const extra of extras) {
      expect(extra.reply).toHaveBeenCalled();
    }
    expect(chatMessagesMock).toHaveBeenCalledTimes(1 + extras.length);
  });

  it("drops queued replies after the chatbot is disabled", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
      mode: "ambient",
    }));
    let releaseFirst!: (value: ReturnType<typeof aiResult>) => void;
    const gate = new Promise<ReturnType<typeof aiResult>>((resolve) => {
      releaseFirst = resolve;
    });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    chatMessagesMock.mockImplementationOnce(async () => {
      started();
      return gate;
    });

    const first = makeMsg({ id: "disable-1", mentioned: true, authorId: "u1" });
    const running = handleChatbot(first);
    await startedPromise;
    const queued = makeMsg({ id: "disable-2", mentioned: true, authorId: "u2" });
    await handleChatbot(queued);
    configMock.getConfig.mockImplementation(async () => ({
      enabled: false,
      channelId: null,
      mode: "ambient",
    }));

    releaseFirst(aiResult("primero"));
    await running;
    expect(chatMessagesMock).toHaveBeenCalledTimes(1);
    expect(queued.reply).not.toHaveBeenCalled();
  });

  it("replies to a mention in an ignored channel", async () => {
    isIgnoredMock.mockImplementation(async () => true);
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
    }));
    const msg = makeMsg({ mentioned: true });
    await handleChatbot(msg);
    expect(chatMessagesMock).toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalled();
  });

  it("still icebreaks if fetching previous messages fails", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: CHANNEL,
    }));
    const msg = makeMsg({ content: "buenas" });
    Object.assign(msg.channel, {
      messages: {
        fetch: mock(async () => {
          throw new Error("discord down");
        }),
      },
    });
    await handleChatbot(msg);
    expect(chatMessagesMock).toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalled();
  });

  it("does not icebreak after re-enabling if the AI channel stayed active", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: false,
      channelId: CHANNEL,
    }));
    await handleChatbot(makeMsg({ id: "while-off", content: "hablando" }));
    expect(chatMessagesMock).not.toHaveBeenCalled();

    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: CHANNEL,
    }));
    const next = makeMsg({
      id: "after-on",
      content: "sigo",
      authorId: "999999999999999999",
    });
    await handleChatbot(next);
    expect(chatMessagesMock).not.toHaveBeenCalled();
  });

  it("tells the user they cannot talk when they mention the bot", async () => {
    allowMock.canUse.mockImplementation(async () => false);
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: null,
    }));
    const msg = makeMsg({ mentioned: true });
    await handleChatbot(msg);
    expect(chatMessagesMock).not.toHaveBeenCalled();
    const payload = (msg.reply as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { content: string };
    expect(payload.content).toContain("permiso");
  });

  it("stays quiet in ambient mode when the author is not allowed", async () => {
    allowMock.canUse.mockImplementation(async () => false);
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: CHANNEL,
    }));
    const msg = makeMsg({ content: "buenas" });
    await handleChatbot(msg);
    expect(chatMessagesMock).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });
});
