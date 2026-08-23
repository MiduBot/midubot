import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";

const reviewMock = {
  confirm: mock(async () => true),
  correct: mock(async () => true),
};
const runsMock = {
  getTarget: mock(async () => ({
    id: 41,
    runId: 9,
    guildId: "g1",
    candidateIndex: 0,
    messageId: "m1",
    authorId: "offender",
    channelId: "c1",
    content: "mensaje",
    attachments: [],
    finalLabel: "malicious",
    action: "timeout",
    actionStatus: "pending",
    audited: false,
    expiresAt: new Date(),
    createdAt: new Date(),
  })),
  getRun: mock(async () => ({
    id: 9,
    guildId: "g1",
    feature: "ai-mod",
    mode: "autonomous",
    triggerMessageId: "report",
    reporterId: "reporter",
    reportContent: "revisar",
    primary: { status: "ok", evaluation: {
      outcome: "violation",
      confidence: 0.95,
      targets: [{ candidateIndex: 0, label: "malicious", evidence: [] }],
      reason: "scam",
    } },
    judge: { status: "ok", evaluation: {
      outcome: "violation",
      confidence: 0.92,
      targets: [{ candidateIndex: 0, label: "malicious", evidence: [] }],
      reason: "scam",
    } },
    finalKind: "temporary_action",
    decisionReason: "agreement",
    createdAt: new Date(),
  })),
};
const rolesMock = { list: mock(async () => []) };
const notifyMock = { list: mock(async () => []) };
const timeoutMock = mock(async () => {});

mock.module("@/features/language", () => ({
  LanguageService: { getLanguage: mock(async () => "es") },
}));
mock.module("@/features/ai-moderation/services/review.service", () => ({
  ModerationReviewService: reviewMock,
}));
mock.module("@/features/ai-moderation/services/runs.service", () => ({
  ModerationRunsService: runsMock,
}));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({
  ModRoleService: rolesMock,
}));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({
  NotifyTargetsService: notifyMock,
}));

import {
  handleModerationReviewButton,
} from "@/features/ai-moderation/handlers/review-button.handler";
import {
  handleModerationReviewModal,
} from "@/features/ai-moderation/handlers/review-modal.handler";

function makeButton(
  customId: string,
  options: { manageMessages?: boolean; roles?: string[] } = {},
): ButtonInteraction {
  const roles = new Set(options.roles ?? []);
  return {
    customId,
    guildId: "g1",
    user: { id: "reviewer", username: "reviewer" },
    member: {
      permissions: { has: () => options.manageMessages ?? false },
      roles: { cache: { has: (roleId: string) => roles.has(roleId) } },
    },
    message: { embeds: [], components: [], edit: mock(async () => {}) },
    reply: mock(async () => {}),
    editReply: mock(async () => {}),
    showModal: mock(async () => {}),
    replied: false,
    deferred: false,
  } as unknown as ButtonInteraction;
}

function makeModal(expectedLabel: string, reason = "motivo humano"): ModalSubmitInteraction {
  return {
    customId: "modreview_correct:41",
    guildId: "g1",
    user: { id: "reviewer", username: "reviewer" },
    member: {
      permissions: { has: () => true },
      roles: { cache: { has: () => false } },
    },
    fields: {
      getTextInputValue: (id: string) => id === "expected_label" ? expectedLabel : reason,
    },
    guild: {
      members: {
        fetch: mock(async () => ({
          isCommunicationDisabled: () => true,
          timeout: timeoutMock,
        })),
      },
    },
    message: { embeds: [], components: [], edit: mock(async () => {}) },
    reply: mock(async () => {}),
    editReply: mock(async () => {}),
    replied: false,
    deferred: false,
  } as unknown as ModalSubmitInteraction;
}

beforeEach(() => {
  reviewMock.confirm.mockReset();
  reviewMock.confirm.mockImplementation(async () => true);
  reviewMock.correct.mockReset();
  reviewMock.correct.mockImplementation(async () => true);
  runsMock.getTarget.mockClear();
  runsMock.getRun.mockClear();
  rolesMock.list.mockClear();
  notifyMock.list.mockClear();
  timeoutMock.mockClear();
});

describe("moderation review handlers", () => {
  it("rejects unauthorized reviewers", async () => {
    const interaction = makeButton("modreview_41_confirm");

    await handleModerationReviewButton(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(reviewMock.confirm).not.toHaveBeenCalled();
  });

  it("confirms without calling AI and disables review components", async () => {
    const interaction = makeButton("modreview_41_confirm", { manageMessages: true });

    await handleModerationReviewButton(interaction);

    expect(reviewMock.confirm).toHaveBeenCalledWith(41, "g1", "ai-mod", "reviewer");
    expect(interaction.message.edit).toHaveBeenCalledWith({ components: [] });
  });

  it("allows a configured mod role to review", async () => {
    rolesMock.list.mockImplementation(async () => [{ id: 1, guildId: "g1", roleId: "mod-role" }]);
    const interaction = makeButton("modreview_41_confirm", { roles: ["mod-role"] });

    await handleModerationReviewButton(interaction);

    expect(reviewMock.confirm).toHaveBeenCalled();
  });

  it("allows configured notify users and roles to review", async () => {
    notifyMock.list.mockImplementation(async () => [
      { id: 1, guildId: "g1", targetId: "reviewer", targetType: "user" },
    ]);
    const userInteraction = makeButton("modreview_41_confirm");
    await handleModerationReviewButton(userInteraction);
    expect(reviewMock.confirm).toHaveBeenCalled();

    reviewMock.confirm.mockClear();
    notifyMock.list.mockImplementation(async () => [
      { id: 2, guildId: "g1", targetId: "staff-role", targetType: "role" },
    ]);
    const roleInteraction = makeButton("modreview_41_confirm", { roles: ["staff-role"] });
    await handleModerationReviewButton(roleInteraction);
    expect(reviewMock.confirm).toHaveBeenCalled();
  });

  it("keeps card components when another reviewer already resolved target", async () => {
    reviewMock.confirm.mockImplementation(async () => false);
    const interaction = makeButton("modreview_41_confirm", { manageMessages: true });

    await handleModerationReviewButton(interaction);

    expect(interaction.message.edit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it("opens correction modal with target-specific custom id", async () => {
    const interaction = makeButton("modreview_41_correct", { manageMessages: true });

    await handleModerationReviewButton(interaction);

    expect(interaction.showModal).toHaveBeenCalled();
    const modal = (interaction.showModal as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as {
      data: { custom_id: string };
    };
    expect(modal.data.custom_id).toBe("modreview_correct:41");
  });

  it("validates correction label and removes active timeout when corrected to allow", async () => {
    const interaction = makeModal("allow");

    await handleModerationReviewModal(interaction);

    expect(reviewMock.correct).toHaveBeenCalledWith({
      targetId: 41,
      guildId: "g1",
      feature: "ai-mod",
      expectedLabel: "allow",
      reason: "motivo humano",
      reviewerId: "reviewer",
    });
    expect(timeoutMock).toHaveBeenCalledWith(null, "moderation review correction: allow");
    expect(interaction.message.edit).toHaveBeenCalledWith({ components: [] });
  });

  it("rejects labels not allowed by feature", async () => {
    const interaction = makeModal("job_offer");

    await handleModerationReviewModal(interaction);

    expect(reviewMock.correct).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });
});
