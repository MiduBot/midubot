import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { ButtonInteraction } from "discord.js";

const casesMock = {
  get: mock(async () => ({
    id: 7,
    guildId: "g1",
    authorId: "user1",
    channelId: "c1",
    messageId: "m1",
    content: "busco dev remoto",
    verdict: "block",
    confidence: 0.9,
    reason: "oferta de empleo",
    deleted: true,
    resolved: false,
    resolvedBy: null,
    resolvedAction: null,
    feedbackAction: null,
    promptPending: false,
    promptError: null,
  })),
  markResolved: mock(async () => {}),
  markFeedbackPending: mock(async () => {}),
};
const feedbackMock = {
  generateAntiFpPrompt: mock(async () => "nota de contexto"),
  generateTruePositivePrompt: mock(async () => "nota de refuerzo"),
};
const promptsMock = { add: mock(async () => {}) };

mock.module("@/features/job-guard/services/cases.service", () => ({
  JobGuardCasesService: casesMock,
}));
mock.module("@/features/job-guard/services/prompts.service", () => ({
  JobGuardPromptsService: promptsMock,
}));
mock.module("@/features/job-guard/services/feedback.service", () => ({
  JobGuardFeedbackService: feedbackMock,
}));

import { handleJobGuardFeedbackButton } from "@/features/job-guard/handlers/feedback-button.handler";

function makeInteraction(
  customId: string,
  opts: { manageMessages?: boolean } = {},
): ButtonInteraction {
  return {
    customId,
    guildId: "g1",
    member: {
      permissions: { has: () => !!opts.manageMessages },
      user: { id: "clicker", username: "modclicker" },
    },
    user: { id: "clicker", username: "modclicker" },
    message: { embeds: [], edit: mock(async () => {}) },
    replied: false,
    deferred: false,
    reply: mock(async () => {}),
    editReply: mock(async () => {}),
  } as unknown as ButtonInteraction;
}

beforeEach(() => {
  casesMock.get.mockImplementation(async () => ({
    id: 7,
    guildId: "g1",
    authorId: "user1",
    channelId: "c1",
    messageId: "m1",
    content: "busco dev remoto",
    verdict: "block",
    confidence: 0.9,
    reason: "oferta de empleo",
    deleted: true,
    resolved: false,
    resolvedBy: null,
    resolvedAction: null,
    feedbackAction: null,
    promptPending: false,
    promptError: null,
  }));
  casesMock.markResolved.mockClear();
  casesMock.markFeedbackPending.mockClear();
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

describe("handleJobGuardFeedbackButton", () => {
  it("replies no-permission when the clicker lacks ManageMessages", async () => {
    const ix = makeInteraction("jobguard_7_correct", {});
    await handleJobGuardFeedbackButton(ix);
    expect(ix.reply).toHaveBeenCalled();
    expect(firstReplyContent(ix)).toContain("No tienes permiso");
    expect(casesMock.markResolved).not.toHaveBeenCalled();
  });

  it("correct: acknowledges, generates TP prompt, saves, resolves, disables buttons", async () => {
    const ix = makeInteraction("jobguard_7_correct", { manageMessages: true });
    await handleJobGuardFeedbackButton(ix);
    expect(ix.reply).toHaveBeenCalled();
    expect(firstReplyContent(ix)).toContain("Procesando feedback");
    expect(feedbackMock.generateTruePositivePrompt).toHaveBeenCalledWith(
      "busco dev remoto",
      "block",
      0.9,
      "oferta de empleo",
    );
    expect(promptsMock.add).toHaveBeenCalledWith("g1", "nota de refuerzo");
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "correct");
    expect(casesMock.markFeedbackPending).not.toHaveBeenCalled();
    const summary = lastEditReplyContent(ix);
    expect(summary).toContain("nota de refuerzo");
    expect(summary).toContain("Prompt guardado");
    expect(summary).toContain("Caso #7");
    expect(ix.message.edit).toHaveBeenCalled();
    const editPayload = (ix.message.edit as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as { components: unknown[] };
    expect(editPayload.components).toEqual([]);
  });

  it("incorrect: anti-FP prompt, saves, resolves, disables buttons", async () => {
    const ix = makeInteraction("jobguard_7_incorrect", { manageMessages: true });
    await handleJobGuardFeedbackButton(ix);
    expect(feedbackMock.generateAntiFpPrompt).toHaveBeenCalledWith(
      "busco dev remoto",
      "block",
      0.9,
      "oferta de empleo",
    );
    expect(promptsMock.add).toHaveBeenCalledWith("g1", "nota de contexto");
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "incorrect");
    expect(ix.message.edit).toHaveBeenCalled();
  });

  it("AI returns null: markFeedbackPending, buttons not disabled", async () => {
    feedbackMock.generateTruePositivePrompt.mockImplementation(async () => null);
    const ix = makeInteraction("jobguard_7_correct", { manageMessages: true });
    await handleJobGuardFeedbackButton(ix);
    expect(promptsMock.add).not.toHaveBeenCalled();
    expect(casesMock.markResolved).not.toHaveBeenCalled();
    expect(casesMock.markFeedbackPending).toHaveBeenCalledWith(
      7,
      "clicker",
      "correct",
      "AI unavailable",
    );
    const summary = lastEditReplyContent(ix);
    expect(summary).toContain("No se pudo generar prompt");
    expect(summary).toContain("pendiente de prompt");
    expect(ix.message.edit).not.toHaveBeenCalled();
  });

  it("already-resolved case: editReply reports early return", async () => {
    casesMock.get.mockImplementation(async () => ({
      id: 7,
      guildId: "g1",
      authorId: "user1",
      channelId: "c1",
      messageId: "m1",
      content: "busco dev remoto",
      verdict: "block",
      confidence: 0.9,
      reason: "oferta",
      deleted: true,
      resolved: true,
      resolvedBy: "x",
      resolvedAction: "correct",
      feedbackAction: "correct",
      promptPending: false,
      promptError: null,
    }));
    const ix = makeInteraction("jobguard_7_correct", { manageMessages: true });
    await handleJobGuardFeedbackButton(ix);
    expect(casesMock.markResolved).not.toHaveBeenCalled();
    expect(lastEditReplyContent(ix)).toContain("ya fue resuelto");
  });

  it("invalid customId: silently returns without replying", async () => {
    const ix = makeInteraction("jobguard_nope_garbage", { manageMessages: true });
    await handleJobGuardFeedbackButton(ix);
    expect(ix.reply).not.toHaveBeenCalled();
    expect(ix.editReply).not.toHaveBeenCalled();
  });
});
