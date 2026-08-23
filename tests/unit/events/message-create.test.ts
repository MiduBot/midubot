import { describe, it, expect, mock } from "bun:test";
import { createMockMessage } from "../../mocks/discord";

const hasPermissionMock = mock(async () => false);
mock.module("@/core/discord/permissions", () => ({
  hasPermission: hasPermissionMock,
}));

const evalCommand = { name: "eval", aliases: ["ev"], execute: mock(async () => {}) };
const otherCommand = { name: "note", aliases: [], execute: mock(async () => {}) };
const getCommandMock = mock((name: string) => {
  if (name === "eval" || name === "ev") return evalCommand;
  if (name === "note") return otherCommand;
  return undefined;
});
mock.module("@/commands/registry", () => ({ getCommand: getCommandMock }));

mock.module("@/i18n", () => ({
  getTranslation: () => ({
    commands: {
      unknown: "unknown {prefix}",
      whitelist_perms: "no perms",
    },
  }),
}));

mock.module("@/features/language", () => ({
  LanguageService: { getLanguage: async () => "es" },
}));

const enforceJobGuardMock = mock(async () => {});
mock.module("@/features/job-guard", () => ({
  enforceJobGuard: enforceJobGuardMock,
}));
mock.module("@/features/unique-channel", () => ({
  enforceUniqueChannel: async () => {},
}));
mock.module("@/features/link-cooldown", () => ({
  enforceLinkCooldown: async () => {},
}));
mock.module("@/features/link-newcomer", () => ({
  enforceLinkNewcomer: async () => {},
}));
mock.module("@/features/line-filter", () => ({
  applyLineFilter: async () => {},
}));
mock.module("@/features/ai-mod", () => ({
  handleModMention: async () => {},
}));
mock.module("@/features/ai", () => ({
  handleChatbot: async () => {},
}));
mock.module("@/features/images", () => ({
  monitorImages: async () => {},
}));
mock.module("@/core/discord/moderation", () => ({
  containsImageUrl: () => false,
}));

import { handleMessageCreate } from "@/events/message-create";

describe("handleMessageCreate — eval command permission bypass", () => {
  it("calls eval's execute even when hasPermission returns false", async () => {
    hasPermissionMock.mockClear();
    evalCommand.execute.mockClear();
    const msg = createMockMessage({ content: "m!eval 1+1" });
    await handleMessageCreate(msg, {} as any);
    expect(evalCommand.execute).toHaveBeenCalledTimes(1);
  });

  it("does not send a permission-denied reply for eval when hasPermission returns false", async () => {
    hasPermissionMock.mockClear();
    const msg = createMockMessage({ content: "m!eval 1+1" });
    await handleMessageCreate(msg, {} as any);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it("still enforces hasPermission for a non-eval command", async () => {
    hasPermissionMock.mockClear();
    otherCommand.execute.mockClear();
    const msg = createMockMessage({ content: "m!note something" });
    await handleMessageCreate(msg, {} as any);
    expect(hasPermissionMock).toHaveBeenCalledTimes(1);
    expect(otherCommand.execute).not.toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalledWith("no perms");
  });

  it("calls execute for a non-eval command when hasPermission returns true", async () => {
    hasPermissionMock.mockImplementationOnce(async () => true);
    otherCommand.execute.mockClear();
    const msg = createMockMessage({ content: "m!note something" });
    await handleMessageCreate(msg, {} as any);
    expect(otherCommand.execute).toHaveBeenCalledTimes(1);
  });

  it("does not wait for background job-guard enforcement", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    enforceJobGuardMock.mockClear();
    enforceJobGuardMock.mockImplementationOnce(() => pending);

    const messagePromise = handleMessageCreate(
      createMockMessage({ content: "se busca dev" }),
      {} as any,
    );
    const result = await Promise.race([
      messagePromise.then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 25)),
    ]);

    expect(result).toBe("resolved");
    expect(enforceJobGuardMock).toHaveBeenCalledTimes(1);
    release();
    await pending;
  });
});
