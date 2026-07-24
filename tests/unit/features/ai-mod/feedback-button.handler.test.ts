import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { ButtonInteraction } from "discord.js";

const casesMock = {
  get: mock(async () => ({
    id: 7, guildId: "g1", authorId: "spammer", channelId: "c1", messageId: "m1",
    content: "send me a DM", verdict: 1, confidence: 0.9, platform: 0,
    reason: "estafa", actionTaken: "timeout", resolved: false,
    resolvedBy: null, resolvedAction: null,
    feedbackAction: null, promptPending: false, promptError: null,
  })),
  markResolved: mock(async () => {}),
  markFeedbackPending: mock(async () => {}),
};
const maliciousMock = { addIfAbsent: mock(async () => {}) };
const feedbackMock = {
  generateAntiFpPrompt: mock(async () => "nota de contexto"),
  generateTruePositivePrompt: mock(async () => "nota de refuerzo"),
};
const promptsMock = { add: mock(async () => {}) };
const modRoleMock = { list: mock(async () => []) };
const notifyMock = { list: mock(async () => []) };

mock.module("@/features/ai-mod/services/cases.service", () => ({ CasesService: casesMock }));
mock.module("@/features/ai-mod/services/malicious-messages.service", () => ({ MaliciousMessagesService: maliciousMock }));
mock.module("@/features/ai-mod/services/feedback.service", () => ({ FeedbackService: feedbackMock }));
mock.module("@/features/ai-mod/services/ai-prompts.service", () => ({ AiPromptsService: promptsMock }));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({ ModRoleService: modRoleMock }));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({ NotifyTargetsService: notifyMock }));

import { handleFeedbackButton } from "@/features/ai-mod/handlers/feedback-button.handler";

function makeInteraction(
  customId: string,
  opts: { manageMessages?: boolean; inModRoles?: boolean; inNotify?: boolean; offenderInTimeout?: boolean } = {},
): ButtonInteraction {
  const memberRoles = new Set(opts.inModRoles ? ["modrole-1"] : []);
  const offenderInTimeout = opts.offenderInTimeout ?? true;
  return {
    customId,
    guildId: "g1",
    guild: {
      id: "g1",
      members: {
        fetch: mock(async (id: string) => ({
          id,
          isCommunicationDisabled: () => offenderInTimeout,
          timeout: mock(async () => {}),
        })),
      },
    },
    member: {
      permissions: { has: () => !!opts.manageMessages },
      roles: { cache: { has: (r: string) => memberRoles.has(r) } },
      user: { id: "clicker", username: "modclicker" },
    },
    user: { id: "clicker", username: "modclicker" },
    message: { embeds: [], edit: mock(async () => {}) },
    replied: false,
    deferred: false,
    reply: mock(async () => {}),
    update: mock(async () => {}),
    deferUpdate: mock(async () => {}),
    editReply: mock(async () => {}),
  } as unknown as ButtonInteraction;
}

beforeEach(() => {
  casesMock.get.mockImplementation(async () => ({
    id: 7, guildId: "g1", authorId: "spammer", channelId: "c1", messageId: "m1",
    content: "send me a DM", verdict: 1, confidence: 0.9, platform: 0,
    reason: "estafa", actionTaken: "timeout", resolved: false,
    resolvedBy: null, resolvedAction: null,
    feedbackAction: null, promptPending: false, promptError: null,
  }));
  casesMock.markResolved.mockClear();
  casesMock.markFeedbackPending.mockClear();
  maliciousMock.addIfAbsent.mockClear();
  feedbackMock.generateAntiFpPrompt.mockClear();
  feedbackMock.generateAntiFpPrompt.mockImplementation(async () => "nota de contexto");
  feedbackMock.generateTruePositivePrompt.mockClear();
  feedbackMock.generateTruePositivePrompt.mockImplementation(async () => "nota de refuerzo");
  promptsMock.add.mockClear();
  promptsMock.add.mockImplementation(async () => {});
});

function lastEditReplyContent(ix: ButtonInteraction): string {
  const calls = (ix.editReply as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const last = calls[calls.length - 1];
  return (last[0] as { content: string }).content;
}

function firstReplyContent(ix: ButtonInteraction): string {
  const calls = (ix.reply as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return (calls[0][0] as { content: string }).content;
}

describe("handleFeedbackButton", () => {
  it("replies no-permission when the clicker lacks perms and is not a mod/notify target", async () => {
    const ix = makeInteraction("aimod_7_correct", {});
    await handleFeedbackButton(ix);
    expect(ix.reply).toHaveBeenCalled();
    expect(firstReplyContent(ix)).toContain("No tienes permiso");
    expect(casesMock.markResolved).not.toHaveBeenCalled();
  });

  it("correct: acknowledges immediately, then editReply shows actions done", async () => {
    const ix = makeInteraction("aimod_7_correct", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(ix.reply).toHaveBeenCalled();
    expect(firstReplyContent(ix)).toContain("Procesando feedback");
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", true);
    expect(feedbackMock.generateTruePositivePrompt).toHaveBeenCalled();
    expect(promptsMock.add).toHaveBeenCalledWith("g1", "nota de refuerzo");
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "correct");
    expect(casesMock.markFeedbackPending).not.toHaveBeenCalled();
    const summary = lastEditReplyContent(ix);
    expect(summary).toContain("malicious=true");
    expect(summary).toContain("nota de refuerzo");
    expect(summary).toContain("Prompt guardado");
    expect(summary).toContain("Caso #7");
    expect(ix.message.edit).toHaveBeenCalled();
  });

  it("correct with AI failure: side-effects yes, pending, buttons kept", async () => {
    feedbackMock.generateTruePositivePrompt.mockImplementation(async () => null);
    const ix = makeInteraction("aimod_7_correct", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", true);
    expect(promptsMock.add).not.toHaveBeenCalled();
    expect(casesMock.markResolved).not.toHaveBeenCalled();
    expect(casesMock.markFeedbackPending).toHaveBeenCalledWith(7, "clicker", "correct", "AI unavailable");
    const summary = lastEditReplyContent(ix);
    expect(summary).toContain("No se pudo generar prompt");
    expect(summary).toContain("pendiente de prompt");
    expect(summary).not.toContain("Prompt guardado");
    expect(ix.message.edit).not.toHaveBeenCalled();
  });

  it("correct with prompt save failure: pending, buttons kept", async () => {
    promptsMock.add.mockImplementation(async () => {
      throw new Error("db down");
    });
    const ix = makeInteraction("aimod_7_correct", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(casesMock.markResolved).not.toHaveBeenCalled();
    expect(casesMock.markFeedbackPending).toHaveBeenCalledWith(7, "clicker", "correct", "prompt save failed");
    expect(ix.message.edit).not.toHaveBeenCalled();
  });

  it("incorrect: removes timeout, generates prompt, marks resolved, summary lists all", async () => {
    const ix = makeInteraction("aimod_7_incorrect", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(ix.reply).toHaveBeenCalled();
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", false);
    expect(feedbackMock.generateAntiFpPrompt).toHaveBeenCalled();
    expect(promptsMock.add).toHaveBeenCalledWith("g1", "nota de contexto");
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "incorrect");
    const summary = lastEditReplyContent(ix);
    expect(summary).toContain("malicious=false");
    expect(summary).toContain("nota de contexto");
    expect(summary).toContain("Prompt guardado");
    expect(summary).toContain("Timeout del autor removido");
    expect(summary).toContain("Caso #7");
  });

  it("incorrect with AI failure: removes timeout, pending, buttons kept", async () => {
    feedbackMock.generateAntiFpPrompt.mockImplementation(async () => null);
    const ix = makeInteraction("aimod_7_incorrect", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", false);
    expect(promptsMock.add).not.toHaveBeenCalled();
    expect(casesMock.markResolved).not.toHaveBeenCalled();
    expect(casesMock.markFeedbackPending).toHaveBeenCalledWith(7, "clicker", "incorrect", "AI unavailable");
    const summary = lastEditReplyContent(ix);
    expect(summary).toContain("No se pudo generar prompt");
    expect(summary).toContain("Timeout del autor removido");
    expect(summary).toContain("pendiente de prompt");
    expect(ix.message.edit).not.toHaveBeenCalled();
  });

  it("retry after pending: resolves when prompt succeeds", async () => {
    casesMock.get.mockImplementation(async () => ({
      id: 7, guildId: "g1", authorId: "spammer", channelId: "c1", messageId: "m1",
      content: "send me a DM", verdict: 1, confidence: 0.9, platform: 0,
      reason: "estafa", actionTaken: "timeout", resolved: false,
      resolvedBy: "clicker", resolvedAction: null,
      feedbackAction: "correct", promptPending: true, promptError: "AI unavailable",
    }));
    const ix = makeInteraction("aimod_7_correct", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", true);
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "correct");
    expect(casesMock.markFeedbackPending).not.toHaveBeenCalled();
    expect(ix.message.edit).toHaveBeenCalled();
  });

  it("incorrect when author not in timeout: summary reports that step explicitly", async () => {
    const ix = makeInteraction("aimod_7_incorrect", { manageMessages: true, offenderInTimeout: false });
    await handleFeedbackButton(ix);
    const summary = lastEditReplyContent(ix);
    expect(summary).toContain("no estaba en timeout");
    expect(summary).not.toContain("Timeout del autor removido");
  });

  it("incorrect when author not in timeout: alert note does not claim timeout removed", async () => {
    const ix = makeInteraction("aimod_7_incorrect", { manageMessages: true, offenderInTimeout: false });
    await handleFeedbackButton(ix);
    const editCalls = (ix.message.edit as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(editCalls.length).toBe(1);
    const content = (editCalls[0][0] as { content?: string }).content ?? "";
    expect(content).toContain("Marcado como incorrecto");
    expect(content).not.toContain("Timeout removido");
  });

  it("already-resolved case: editReply reports the early-return message", async () => {
    casesMock.get.mockImplementation(async () => ({
      id: 7, guildId: "g1", authorId: "spammer", channelId: "c1", messageId: "m1",
      content: "send me a DM", verdict: 1, confidence: 0.9, platform: 0,
      reason: "estafa", actionTaken: "timeout", resolved: true,
      resolvedBy: "x", resolvedAction: "correct",
      feedbackAction: "correct", promptPending: false, promptError: null,
    }));
    const ix = makeInteraction("aimod_7_correct", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(casesMock.markResolved).not.toHaveBeenCalled();
    expect(casesMock.markFeedbackPending).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalled();
    expect(ix.editReply).toHaveBeenCalled();
    expect(lastEditReplyContent(ix)).toContain("ya fue resuelto");
  });

  it("invalid customId: silently returns without replying", async () => {
    const ix = makeInteraction("aimod_nope_garbage", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(ix.reply).not.toHaveBeenCalled();
    expect(ix.editReply).not.toHaveBeenCalled();
  });
});
