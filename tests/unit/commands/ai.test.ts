import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage } from "../../mocks/discord";
import { ChannelType } from "discord.js";

const configMock = {
  getConfig: mock(async () => ({ enabled: false, channelId: null as string | null })),
  setEnabled: mock(async () => {}),
  setChannel: mock(async () => {}),
  clearChannel: mock(async () => {}),
};
const chatMock = mock(async () => "pong");

mock.module("@/features/ai/services/ai-chat-config.service", () => ({
  AiChatConfigService: configMock,
}));
mock.module("@/features/ai-mod", () => ({
  AIClientService: { chat: chatMock },
}));

import { handleAiCommand } from "@/features/ai/commands/ai.command";

const OWNER_ID = "398321973404368927";

describe("handleAiCommand", () => {
  beforeEach(() => {
    configMock.getConfig.mockClear();
    configMock.setEnabled.mockClear();
    configMock.setChannel.mockClear();
    configMock.clearChannel.mockClear();
    chatMock.mockClear();
    configMock.getConfig.mockImplementation(async () => ({
      enabled: false,
      channelId: null,
    }));
    chatMock.mockImplementation(async () => "pong");
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
});
