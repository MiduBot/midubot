import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage } from "../../../mocks/discord";

const configMock = {
  isEnabled: mock(async () => false),
  setEnabled: mock(async () => {}),
};
const casesMock = {
  list: mock(async () => []),
  count: mock(async () => 0),
  get: mock(async () => null),
};
const modRoleMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};
const ignoredMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};
const notifyMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};
const bypassMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};

mock.module("@/features/ai-mod/services/ai-mod-config.service", () => ({
  AiModConfigService: configMock,
}));
mock.module("@/features/ai-mod/services/cases.service", () => ({
  CasesService: casesMock,
}));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({
  ModRoleService: modRoleMock,
}));
mock.module("@/features/ai-mod/services/ignored-channels.service", () => ({
  IgnoredChannelsService: ignoredMock,
}));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({
  NotifyTargetsService: notifyMock,
}));
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({
  SelfpromoBypassService: bypassMock,
}));

import { handleAimodCommand } from "@/features/ai-mod/commands/aimod.command";
import { handleModroleCommand } from "@/features/ai-mod/commands/modrole.command";
import { handleIgnorechannelCommand } from "@/features/ai-mod/commands/ignorechannel.command";
import { handleNotifyCommand } from "@/features/ai-mod/commands/notify.command";
import { handleSelfpromochannelCommand } from "@/features/ai-mod/commands/selfpromochannel.command";

function makeMsg(argsManageGuild = true): ReturnType<typeof createMockMessage> {
  const msg = createMockMessage({});
  (msg.member as unknown as { permissions: { has: (p: unknown) => boolean } }).permissions = {
    has: () => argsManageGuild,
  };
  return msg;
}

beforeEach(() => {
  configMock.isEnabled.mockClear();
  configMock.setEnabled.mockClear();
  casesMock.list.mockClear();
  casesMock.count.mockClear();
  casesMock.get.mockClear();
  casesMock.list.mockImplementation(async () => []);
  casesMock.count.mockImplementation(async () => 0);
  casesMock.get.mockImplementation(async () => null);
  modRoleMock.add.mockClear();
  modRoleMock.remove.mockClear();
  ignoredMock.add.mockClear();
  ignoredMock.remove.mockClear();
  notifyMock.add.mockClear();
  notifyMock.remove.mockClear();
  bypassMock.add.mockClear();
  bypassMock.remove.mockClear();
});

describe("handleAimodCommand", () => {
  it("shows usage with no subcommand", async () => {
    const msg = makeMsg();
    await handleAimodCommand(msg, [], "m!");
    expect(msg.reply).toHaveBeenCalled();
    expect(configMock.setEnabled).not.toHaveBeenCalled();
  });
  it("enables the feature on 'on'", async () => {
    const msg = makeMsg();
    await handleAimodCommand(msg, ["on"], "m!");
    expect(configMock.setEnabled).toHaveBeenCalledWith("g1", true);
  });
  it("disables the feature on 'off'", async () => {
    const msg = makeMsg();
    await handleAimodCommand(msg, ["off"], "m!");
    expect(configMock.setEnabled).toHaveBeenCalledWith("g1", false);
  });
  it("reports status on 'status'", async () => {
    configMock.isEnabled.mockImplementation(async () => true);
    const msg = makeMsg();
    await handleAimodCommand(msg, ["status"], "m!");
    expect(configMock.isEnabled).toHaveBeenCalledWith("g1");
  });
  it("denies without ManageGuild", async () => {
    const msg = makeMsg(false);
    await handleAimodCommand(msg, ["on"], "m!");
    expect(configMock.setEnabled).not.toHaveBeenCalled();
  });
  it("cases: empty list replies empty message", async () => {
    const msg = makeMsg();
    await handleAimodCommand(msg, ["cases"], "m!");
    expect(casesMock.count).toHaveBeenCalledWith("g1", "pending");
    expect(casesMock.list).toHaveBeenCalledWith("g1", "pending", 10, 0);
    expect(msg.reply).toHaveBeenCalled();
    const content = (msg.reply as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(String(content)).toContain("No hay casos");
  });
  it("cases: lists rows with filter and page", async () => {
    casesMock.count.mockImplementation(async () => 12);
    casesMock.list.mockImplementation(async () => [
      {
        id: 42,
        guildId: "g1",
        authorId: "u1",
        channelId: "c1",
        messageId: "m1",
        content: "mira mi canal youtube",
        verdict: 2,
        confidence: 0.91,
        platform: 1,
        reason: "yt",
        actionTaken: "timeout",
        resolved: false,
        resolvedBy: null,
        resolvedAction: null,
        feedbackAction: "correct",
        promptPending: true,
        promptError: "AI unavailable",
      },
    ]);
    const msg = makeMsg();
    await handleAimodCommand(msg, ["cases", "all", "2"], "m!");
    expect(casesMock.list).toHaveBeenCalledWith("g1", "all", 10, 10);
    const content = String(
      (msg.reply as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0],
    );
    expect(content).toContain("#42");
    expect(content).toContain("selfpromo");
    expect(content).toContain("prompt_pending");
  });
  it("case: not found for other guild", async () => {
    casesMock.get.mockImplementation(async () => ({
      id: 7,
      guildId: "other",
      authorId: "u1",
      channelId: "c1",
      messageId: "m1",
      content: "x",
      verdict: 1,
      confidence: 0.5,
      platform: 0,
      reason: null,
      actionTaken: null,
      resolved: false,
      resolvedBy: null,
      resolvedAction: null,
      feedbackAction: null,
      promptPending: false,
      promptError: null,
    }));
    const msg = makeMsg();
    await handleAimodCommand(msg, ["case", "7"], "m!");
    const content = String(
      (msg.reply as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0],
    );
    expect(content).toContain("no encontrado");
  });
  it("case: shows detail for matching guild", async () => {
    casesMock.get.mockImplementation(async () => ({
      id: 7,
      guildId: "g1",
      authorId: "spammer",
      channelId: "c1",
      messageId: "m1",
      content: "send me a DM",
      verdict: 1,
      confidence: 0.9,
      platform: 0,
      reason: "estafa",
      actionTaken: "timeout",
      resolved: false,
      resolvedBy: null,
      resolvedAction: null,
      feedbackAction: null,
      promptPending: false,
      promptError: null,
      createdAt: new Date("2026-07-23T12:00:00.000Z"),
    }));
    const msg = makeMsg();
    await handleAimodCommand(msg, ["case", "7"], "m!");
    const content = String(
      (msg.reply as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0],
    );
    expect(content).toContain("Caso #7");
    expect(content).toContain("malicious");
    expect(content).toContain("spammer");
    expect(content).toContain("https://discord.com/channels/g1/c1/m1");
  });
});

describe("handleModroleCommand", () => {
  it("adds a role from a mention", async () => {
    const msg = makeMsg();
    await handleModroleCommand(msg, ["add", "<@&9999>"], "m!");
    expect(modRoleMock.add).toHaveBeenCalledWith("g1", "9999");
  });
  it("removes a role from a mention", async () => {
    const msg = makeMsg();
    await handleModroleCommand(msg, ["remove", "<@&9999>"], "m!");
    expect(modRoleMock.remove).toHaveBeenCalledWith("g1", "9999");
  });
  it("shows usage with no args", async () => {
    const msg = makeMsg();
    await handleModroleCommand(msg, [], "m!");
    expect(modRoleMock.add).not.toHaveBeenCalled();
  });
});

describe("handleIgnorechannelCommand", () => {
  it("adds a channel mention as channel type", async () => {
    const msg = makeMsg();
    await handleIgnorechannelCommand(msg, ["add", "<#1234>"], "m!");
    expect(ignoredMock.add).toHaveBeenCalledWith("g1", "1234", "channel");
  });
  it("adds a raw id as category type", async () => {
    const msg = makeMsg();
    await handleIgnorechannelCommand(msg, ["add", "567890123456789012"], "m!");
    expect(ignoredMock.add).toHaveBeenCalledWith("g1", "567890123456789012", "category");
  });
});

describe("handleNotifyCommand", () => {
  it("adds a user mention as user type", async () => {
    const msg = makeMsg();
    await handleNotifyCommand(msg, ["add", "<@1234>"], "m!");
    expect(notifyMock.add).toHaveBeenCalledWith("g1", "1234", "user");
  });
  it("adds a role mention as role type", async () => {
    const msg = makeMsg();
    await handleNotifyCommand(msg, ["add", "<@&1234>"], "m!");
    expect(notifyMock.add).toHaveBeenCalledWith("g1", "1234", "role");
  });
});

describe("handleSelfpromochannelCommand", () => {
  it("adds a channel from a mention", async () => {
    const msg = makeMsg();
    await handleSelfpromochannelCommand(msg, ["add", "<#1234>"], "m!");
    expect(bypassMock.add).toHaveBeenCalledWith("g1", "1234");
  });
  it("removes a channel", async () => {
    const msg = makeMsg();
    await handleSelfpromochannelCommand(msg, ["remove", "<#1234>"], "m!");
    expect(bypassMock.remove).toHaveBeenCalledWith("g1", "1234");
  });
});
