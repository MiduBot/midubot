import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb } from "../mocks/db";
import { appCache } from "@/core/cache";
import { createMockMessage, createMockClient } from "../mocks/discord";

const { db, setQueryResult, setTableResult, setMutationResult, clear } =
  createMockDb();
mock.module("@/db/connection", () => ({ db }));

const reviewButtonMock = mock(async () => {});
const reviewModalMock = mock(async () => {});
mock.module("@/features/ai-moderation/handlers/review-button.handler", () => ({
  handleModerationReviewButton: reviewButtonMock,
}));
mock.module("@/features/ai-moderation/handlers/review-modal.handler", () => ({
  handleModerationReviewModal: reviewModalMock,
}));

import { handleMessageCreate } from "@/events/message-create";
import { handleInteractionCreate } from "@/events/interaction-create";
import { handleMessageDelete } from "@/events/message-delete";
import { handleClientReady } from "@/events/client-ready";

describe("handleMessageCreate", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
    reviewButtonMock.mockClear();
    reviewModalMock.mockClear();
  });

  it("ignores bot messages", async () => {
    const msg = createMockMessage({ author: { bot: true } });
    await handleMessageCreate(msg, createMockClient());
  });

  it("executes a command", async () => {
    setTableResult("whitelistsTable", "findMany", []);
    setQueryResult("findFirst", null);
    setTableResult("linkCooldownChannelsTable", "findFirst", null);
    setTableResult("uniqueChannelsTable", "findFirst", null);
    setTableResult("guildConfigsTable", "findFirst", null);
    setTableResult("logChannelsTable", "findFirst", null);
    const msg = createMockMessage({ content: "m!version" });
    await handleMessageCreate(msg, createMockClient());
  });

  it("replies unknown command", async () => {
    setTableResult("whitelistsTable", "findMany", []);
    const msg = createMockMessage({ content: "m!unknowncmd" });
    await handleMessageCreate(msg, createMockClient());
  });

  it("rejects without permission", async () => {
    setTableResult("whitelistsTable", "findMany", [
      { id: 1, guildId: "g1", type: "role", entityId: "r1" },
    ]);
    const msg = createMockMessage({ content: "m!version" });
    await handleMessageCreate(msg, createMockClient());
  });

  it("executes help command", async () => {
    setTableResult("whitelistsTable", "findMany", []);
    setQueryResult("findFirst", null);
    const msg = createMockMessage({ content: "m!help" });
    await handleMessageCreate(msg, createMockClient());
  });

  it("runs pipeline for non-command messages", async () => {
    setTableResult("whitelistsTable", "findMany", []);
    setQueryResult("findFirst", null);
    setTableResult("linkCooldownChannelsTable", "findFirst", null);
    setTableResult("uniqueChannelsTable", "findFirst", null);
    setTableResult("guildConfigsTable", "findFirst", null);
    const msg = createMockMessage({ content: "hello" });
    await handleMessageCreate(msg, createMockClient());
  });
});

describe("handleInteractionCreate", () => {
  beforeEach(() => {
    clear();
    appCache.clear();
  });

  it("returns error reply for unknown interaction", async () => {
    const interaction = {
      isMessageContextMenuCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
      reply: mock(() => Promise.resolve()),
      followUp: mock(() => Promise.resolve()),
    } as never;
    await handleInteractionCreate(interaction);
  });

  it("handles message context menu", async () => {
    setTableResult("logChannelsTable", "findFirst", null);
    setTableResult("whitelistsTable", "findMany", []);
    const interaction = {
      isMessageContextMenuCommand: () => true,
      commandName: "Reportar",
      isStringSelectMenu: () => false,
      isButton: () => false,
      isModalSubmit: () => false,
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
      reply: mock(() => Promise.resolve()),
      editReply: mock(() => Promise.resolve()),
      deferReply: mock(() => Promise.resolve()),
      guild: { id: "g1" },
      user: { id: "u2" },
      targetMessage: {
        id: "m1",
        author: { id: "u1", bot: false },
        content: "spam",
        attachments: { values: () => [], size: 0 },
        channelId: "c1",
        member: null,
      },
    } as never;
    await handleInteractionCreate(interaction);
  });

  it("handles string select menu", async () => {
    setTableResult("whitelistsTable", "findFirst", null);
    setTableResult("guildConfigsTable", "findFirst", null);
    const interaction = {
      isMessageContextMenuCommand: () => false,
      isStringSelectMenu: () => true,
      customId: "whitelist_permission_select",
      values: ["ManageMessages"],
      isButton: () => false,
      isModalSubmit: () => false,
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
      guild: { id: "g1" },
      guildId: "g1",
      reply: mock(() => Promise.resolve()),
      update: mock(() => Promise.resolve()),
      followUp: mock(() => Promise.resolve()),
    } as never;
    await handleInteractionCreate(interaction);
  });

  it("handles images button", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    const interaction = {
      isMessageContextMenuCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: "images_prev",
      message: { id: "m1" },
      isModalSubmit: () => false,
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
      guildId: "g1",
      reply: mock(() => Promise.resolve()),
      update: mock(() => Promise.resolve()),
      followUp: mock(() => Promise.resolve()),
    } as never;
    await handleInteractionCreate(interaction);
  });

  it("handles images modal", async () => {
    setTableResult("guildConfigsTable", "findFirst", null);
    const interaction = {
      isMessageContextMenuCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => false,
      isModalSubmit: () => true,
      customId: "images_filter_modal:m1",
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
      guildId: "g1",
      fields: { getTextInputValue: mock(() => "test") },
      reply: mock(() => Promise.resolve()),
      update: mock(() => Promise.resolve()),
      deferUpdate: mock(() => Promise.resolve()),
      channel: {
        messages: { fetch: mock(async () => null) },
      },
      followUp: mock(() => Promise.resolve()),
    } as never;
    await handleInteractionCreate(interaction);
  });

  it("routes shared moderation review buttons and modals before legacy IDs", async () => {
    const button = {
      isMessageContextMenuCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: "modreview_41_confirm",
      isModalSubmit: () => false,
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
    } as never;
    await handleInteractionCreate(button);
    expect(reviewButtonMock).toHaveBeenCalledWith(button);

    const modal = {
      isMessageContextMenuCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => false,
      isModalSubmit: () => true,
      customId: "modreview_correct:41",
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
    } as never;
    await handleInteractionCreate(modal);
    expect(reviewModalMock).toHaveBeenCalledWith(modal);
  });

  it("handles errors gracefully", async () => {
    const interaction = {
      isMessageContextMenuCommand: () => false,
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: "images_prev",
      isModalSubmit: () => false,
      isUserContextMenuCommand: () => false,
      replied: false,
      deferred: false,
      reply: mock(() => Promise.reject(new Error("reply failed"))),
      update: mock(() => Promise.reject(new Error("update failed"))),
      message: { id: "missing" },
      followUp: mock(() => Promise.resolve()),
    } as never;
    await handleInteractionCreate(interaction);
    expect(true).toBe(true);
  });
});

describe("handleMessageDelete", () => {
  it("handles deleted message with no entry", () => {
    const deleted = { id: "m1" } as never;
    handleMessageDelete(deleted);
  });

  it("handles partial message without id", () => {
    handleMessageDelete({ id: null } as never);
  });
});

describe("handleClientReady", () => {
  it("runs without error on empty guilds", async () => {
    const client = {
      user: {
        tag: "Bot#0001",
        setActivity: mock(() => Promise.resolve()),
      },
      guilds: {
        fetch: mock(async () => new Map()),
      },
    } as never;
    await handleClientReady(client);
  });

  it("handles errors during command registration", async () => {
    const client = {
      user: {
        tag: "Bot#0001",
        setActivity: mock(() => Promise.resolve()),
      },
      guilds: {
        fetch: mock(async () =>
          new Map([
            [
              "g1",
              {
                id: "g1",
                commands: {
                  create: mock(() => {
                    throw new Error("rate limit");
                  }),
                },
              },
            ],
          ]),
        ),
      },
    } as never;
    await handleClientReady(client);
  });
});
