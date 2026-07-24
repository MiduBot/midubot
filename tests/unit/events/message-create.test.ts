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
});
