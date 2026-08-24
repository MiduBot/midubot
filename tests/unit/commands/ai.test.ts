import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage } from "../../mocks/discord";
import { ChannelType } from "discord.js";

const configMock = {
  getConfig: mock(async () => ({
    enabled: false,
    channelId: null as string | null,
    mode: "ambient" as const,
  })),
  setEnabled: mock(async () => {}),
  setChannel: mock(async () => {}),
  clearChannel: mock(async () => {}),
  setMode: mock(async () => {}),
};
const allowMock = {
  list: mock(async () => [] as Array<{ type: string; entityId: string }>),
  add: mock(async () => "added" as const),
  remove: mock(async () => true),
  clear: mock(async () => {}),
};
const chatMock = mock(async () => ({
  text: "pong",
  model: "chat-model",
  latencyMs: 1,
  inputTokens: 1,
  outputTokens: 1,
  finishReason: "stop",
}));

mock.module("@/features/ai/services/ai-chat-config.service", () => ({
  AiChatConfigService: configMock,
}));
mock.module("@/features/ai/services/ai-chat-allow.service", () => ({
  AiChatAllowService: allowMock,
}));
mock.module("@/features/ai-mod", () => ({
  AIClientService: { chatMessagesDetailed: chatMock },
}));

import { handleAiCommand } from "@/features/ai/commands/ai.command";

const OWNER_ID = "398321973404368927";

describe("handleAiCommand", () => {
  beforeEach(() => {
    configMock.getConfig.mockClear();
    configMock.setEnabled.mockClear();
    configMock.setChannel.mockClear();
    configMock.clearChannel.mockClear();
    configMock.setMode.mockClear();
    allowMock.list.mockClear();
    allowMock.add.mockClear();
    allowMock.remove.mockClear();
    allowMock.clear.mockClear();
    chatMock.mockClear();
    configMock.getConfig.mockImplementation(async () => ({
      enabled: false,
      channelId: null,
      mode: "ambient",
    }));
    allowMock.list.mockImplementation(async () => []);
    allowMock.add.mockImplementation(async () => "added");
    allowMock.remove.mockImplementation(async () => true);
    allowMock.clear.mockImplementation(async () => {});
    chatMock.mockImplementation(async () => ({
      text: "pong",
      model: "chat-model",
      latencyMs: 1,
      inputTokens: 1,
      outputTokens: 1,
      finishReason: "stop",
    }));
  });

  it("shows usage with no args", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, [], "m!");
    expect(msg.reply).toHaveBeenCalled();
    expect(configMock.setEnabled).not.toHaveBeenCalled();
  });

  it("enables on on/enable", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["on"], "m!");
    expect(configMock.setEnabled).toHaveBeenCalledWith("g1", true);
    await handleAiCommand(msg, ["enable"], "m!");
    expect(configMock.setEnabled).toHaveBeenCalledTimes(2);
  });

  it("disables on off/disable", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["off"], "m!");
    expect(configMock.setEnabled).toHaveBeenCalledWith("g1", false);
  });

  it("reports status", async () => {
    configMock.getConfig.mockImplementation(async () => ({
      enabled: true,
      channelId: "c1",
      mode: "ambient",
    }));
    const msg = createMockMessage();
    await handleAiCommand(msg, ["status"], "m!");
    expect(configMock.getConfig).toHaveBeenCalledWith("g1");
    expect(msg.reply).toHaveBeenCalled();
  });

  it("clears channel with channel off", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["channel", "off"], "m!");
    expect(configMock.clearChannel).toHaveBeenCalledWith("g1");
  });

  it("sets mention-only mode", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["mode", "mentions"], "m!");
    expect(configMock.setMode).toHaveBeenCalledWith("g1", "mentions");
  });

  it("sets a text channel from a mention", async () => {
    const msg = createMockMessage();
    (msg.guild as { channels: { fetch: (id: string) => Promise<unknown> } }).channels = {
      fetch: mock(async () => ({
        type: ChannelType.GuildText,
        permissionsFor: () => ({ has: () => true }),
      })),
    };
    await handleAiCommand(msg, ["channel", "<#123456789012345678>"], "m!");
    expect(configMock.setChannel).toHaveBeenCalledWith("g1", "123456789012345678");
  });

  it("rejects a channel the invoker cannot view", async () => {
    const msg = createMockMessage();
    const member = msg.member;
    (msg.guild as { channels: { fetch: (id: string) => Promise<unknown> } }).channels = {
      fetch: mock(async () => ({
        type: ChannelType.GuildText,
        permissionsFor: (who: unknown) => ({
          has: () => who !== member,
        }),
      })),
    };
    await handleAiCommand(msg, ["channel", "123456789012345678"], "m!");
    expect(configMock.setChannel).not.toHaveBeenCalled();
  });

  it("rejects a channel the bot cannot post in", async () => {
    const msg = createMockMessage();
    const member = msg.member;
    (msg.guild as { channels: { fetch: (id: string) => Promise<unknown> } }).channels = {
      fetch: mock(async () => ({
        type: ChannelType.GuildText,
        permissionsFor: (who: unknown) => ({
          has: () => who === member,
        }),
      })),
    };
    await handleAiCommand(msg, ["channel", "123456789012345678"], "m!");
    expect(configMock.setChannel).not.toHaveBeenCalled();
  });

  it("rejects invalid channel ids", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["channel", "nope"], "m!");
    expect(configMock.setChannel).not.toHaveBeenCalled();
  });

  it("denies test to non-superdevs", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["test"], "m!");
    expect(chatMock).not.toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalled();
  });

  it("runs test for superdev", async () => {
    const msg = createMockMessage({ author: { id: OWNER_ID } });
    await handleAiCommand(msg, ["test"], "m!");
    expect(chatMock).toHaveBeenCalled();
  });

  it("requires a guild for on", async () => {
    const msg = createMockMessage({ guildId: null });
    await handleAiCommand(msg, ["on"], "m!");
    expect(configMock.setEnabled).not.toHaveBeenCalled();
  });

  it("lists allow anyone when empty", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["allow"], "m!");
    expect(allowMock.list).toHaveBeenCalledWith("g1");
    const reply = (msg.reply as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as string;
    expect(reply).toContain("Cualquiera");
  });

  it("adds users, roles, superdev and mods via canuse", async () => {
    const msg = createMockMessage();
    await handleAiCommand(
      msg,
      ["canuse", "add", "<@111111111111111111>", "<@&222222222222222222>", "superdev", "mods"],
      "m!",
    );
    expect(allowMock.add).toHaveBeenCalledTimes(4);
    expect(allowMock.add).toHaveBeenCalledWith("g1", "member", "111111111111111111");
    expect(allowMock.add).toHaveBeenCalledWith("g1", "role", "222222222222222222");
    expect(allowMock.add).toHaveBeenCalledWith("g1", "special", "superdev");
    expect(allowMock.add).toHaveBeenCalledWith("g1", "special", "mods");
  });

  it("adds mods without the add keyword", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["allow", "mods"], "m!");
    expect(allowMock.add).toHaveBeenCalledWith("g1", "special", "mods");
  });

  it("clears the allowlist with any", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["allow", "any"], "m!");
    expect(allowMock.clear).toHaveBeenCalledWith("g1");
  });

  it("removes an allow entry", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["allow", "remove", "mods"], "m!");
    expect(allowMock.remove).toHaveBeenCalledWith("g1", "special", "mods");
  });

  it("rejects mixing any with other targets", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["allow", "add", "any", "mods"], "m!");
    expect(allowMock.clear).not.toHaveBeenCalled();
    expect(allowMock.add).not.toHaveBeenCalled();
  });

  it("treats allow add any as open to everyone", async () => {
    const msg = createMockMessage();
    await handleAiCommand(msg, ["canuse", "add", "any"], "m!");
    expect(allowMock.clear).toHaveBeenCalledWith("g1");
    expect(allowMock.add).not.toHaveBeenCalled();
  });
});
