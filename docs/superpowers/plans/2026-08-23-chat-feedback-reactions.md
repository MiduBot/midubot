# Chat Feedback via Manual Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record chatbot feedback only when the original requester manually reacts to an AI reply with `👍` or `👎`, without displaying feedback controls.

**Architecture:** Keep feedback persistence in `ChatFeedbackService`, adding a response-message lookup that reuses current authorization and atomic single-rating behavior. Add a dedicated reaction handler invoked by the Discord client event; it filters unsupported reactions and silently ignores invalid cases. Chatbot response generation remains unchanged except for removing feedback components.

**Tech Stack:** Bun, TypeScript, discord.js 14, Drizzle ORM, Bun test.

## Global Constraints

- Chatbot replies are sent as normal Discord messages without components or automatic reactions.
- Only `👍` maps to `up` and `👎` maps to `down`; other emojis are ignored.
- Only the original requester can submit feedback, and only one rating is accepted.
- The bot does not add, remove, or acknowledge reactions.
- Reaction failures must be logged without disrupting Discord event processing.

---

### Task 1: Add response-message feedback service path

**Files:**
- Modify: `src/features/ai/services/chat-feedback.service.ts:33-59`
- Modify: `tests/unit/features/ai/chat-feedback.service.test.ts`

**Interfaces:**
- Consumes: persisted `aiChatFeedbackTable.responseMessageId`, `requesterId`, and nullable `rating`.
- Produces: `ChatFeedbackService.rateResponse(responseMessageId: string, userId: string, rating: ChatFeedbackRating): Promise<ChatFeedbackResult>`.

- [ ] **Step 1: Write failing tests for response-keyed ratings**

Mock `db.query.aiChatFeedbackTable.findFirst` and `db.update` using the same service-test mocking style. Cover these exact cases:

```ts
it("rates response message for its requester", async () => {
  queryMock.mockResolvedValueOnce({ requesterId: "user", rating: null });
  updateMock.mockResolvedValueOnce({ rowsAffected: 1 });

  await expect(
    ChatFeedbackService.rateResponse("response", "user", "up"),
  ).resolves.toBe("recorded");
  expect(queryMock).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.anything() }),
  );
});

it("rejects non-requester and duplicate response ratings", async () => {
  queryMock.mockResolvedValueOnce({ requesterId: "other", rating: null });
  await expect(
    ChatFeedbackService.rateResponse("response", "user", "down"),
  ).resolves.toBe("forbidden");

  queryMock.mockResolvedValueOnce({ requesterId: "user", rating: "up" });
  await expect(
    ChatFeedbackService.rateResponse("response", "user", "down"),
  ).resolves.toBe("already_rated");
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `bun test tests/unit/features/ai/chat-feedback.service.test.ts`

Expected: FAIL because `rateResponse` does not exist.

- [ ] **Step 3: Implement minimal response-keyed method**

Add method using `eq(aiChatFeedbackTable.responseMessageId, responseMessageId)` for lookup and update. Preserve current result semantics and update predicate with `isNull(aiChatFeedbackTable.rating)`:

```ts
static async rateResponse(
  responseMessageId: string,
  userId: string,
  rating: ChatFeedbackRating,
): Promise<ChatFeedbackResult> {
  const row = await db.query.aiChatFeedbackTable.findFirst({
    where: eq(aiChatFeedbackTable.responseMessageId, responseMessageId),
  });
  if (!row) return "not_found";
  if (row.requesterId !== userId) return "forbidden";
  if (row.rating) return "already_rated";

  const result = await db
    .update(aiChatFeedbackTable)
    .set({ rating, ratedBy: userId, ratedAt: new Date() })
    .where(
      and(
        eq(aiChatFeedbackTable.responseMessageId, responseMessageId),
        isNull(aiChatFeedbackTable.rating),
      ),
    );
  return Number(
    (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0,
  ) > 0
    ? "recorded"
    : "already_rated";
}
```

- [ ] **Step 4: Run focused tests and commit**

Run: `bun test tests/unit/features/ai/chat-feedback.service.test.ts`

Expected: PASS.

Commit: `git add src/features/ai/services/chat-feedback.service.ts tests/unit/features/ai/chat-feedback.service.test.ts && git commit -m "feat(ai): rate feedback by response"`

### Task 2: Handle manual reaction feedback

**Files:**
- Create: `src/features/ai/handlers/chat-feedback-reaction.handler.ts`
- Create: `tests/unit/features/ai/chat-feedback-reaction.handler.test.ts`
- Modify: `src/features/ai/index.ts:1-3`

**Interfaces:**
- Consumes: Discord `MessageReaction` and `User` from `messageReactionAdd`.
- Produces: `handleChatFeedbackReaction(reaction: MessageReaction, user: User): Promise<void>`.

- [ ] **Step 1: Write failing handler tests**

Mock `ChatFeedbackService.rateResponse`. Assert supported emoji and user are forwarded, while unsupported emoji and bot users are ignored:

```ts
it("records thumbs-up reaction", async () => {
  await handleChatFeedbackReaction(
    { emoji: { name: "👍" }, message: { id: "response" } } as never,
    { id: "user", bot: false } as never,
  );
  expect(rateResponseMock).toHaveBeenCalledWith("response", "user", "up");
});

it("ignores unsupported emojis and bot reactions", async () => {
  await handleChatFeedbackReaction(
    { emoji: { name: "❤️" }, message: { id: "response" } } as never,
    { id: "user", bot: false } as never,
  );
  await handleChatFeedbackReaction(
    { emoji: { name: "👎" }, message: { id: "response" } } as never,
    { id: "bot", bot: true } as never,
  );
  expect(rateResponseMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun test tests/unit/features/ai/chat-feedback-reaction.handler.test.ts`

Expected: FAIL because handler file/export does not exist.

- [ ] **Step 3: Implement filter and silent service call**

Map emoji names with a literal record, return before service call for bot users or unsupported names, call `rateResponse` with `reaction.message.id`, and catch/log service errors through the existing logger. Do not edit the reaction, send a reply, or inspect button interactions.

- [ ] **Step 4: Export handler and run tests**

Export `handleChatFeedbackReaction` from `src/features/ai/index.ts`.

Run: `bun test tests/unit/features/ai/chat-feedback-reaction.handler.test.ts`

Expected: PASS.

Commit: `git add src/features/ai/handlers/chat-feedback-reaction.handler.ts src/features/ai/index.ts tests/unit/features/ai/chat-feedback-reaction.handler.test.ts && git commit -m "feat(ai): handle manual feedback reactions"`

### Task 3: Register reaction event and remove visible controls

**Files:**
- Modify: `src/index.ts:2,20-27,50-56`
- Modify: `src/features/ai/handlers/chatbot.handler.ts:1-8,320-333,374-387`
- Modify: `src/events/interaction-create.ts:11,59-62`
- Delete: `src/features/ai/handlers/chat-feedback.handler.ts`
- Modify: `tests/unit/features/ai/chatbot.handler.test.ts`
- Delete: `tests/unit/features/ai/chat-feedback.handler.test.ts`

**Interfaces:**
- Consumes: exported `handleChatFeedbackReaction` from Task 2.
- Produces: client `messageReactionAdd` handling and replies with no `components` field.

- [ ] **Step 1: Add regression test for normal chatbot response**

Update the chatbot response test to assert the reply call contains only content and allowed mentions, and that `response.edit` is never called. Remove expectations tied to `feedbackRow` or `components`.

- [ ] **Step 2: Run chatbot test and verify failure**

Run: `bun test tests/unit/features/ai/chatbot.handler.test.ts`

Expected: FAIL while `replyTo` still edits the response with feedback components.

- [ ] **Step 3: Remove feedback row generation and edit**

Delete `ActionRowBuilder`, `ButtonBuilder`, and `ButtonStyle` imports, delete `feedbackRow`, and remove `await response.edit({ components: [feedbackRow(message.id)] })`. Keep metrics recording so response rows remain available for reaction lookup.

- [ ] **Step 4: Register Discord reaction capability**

In `src/index.ts`, import `Partials` and the reaction handler. Add `GatewayIntentBits.GuildMessageReactions` and partials `[Partials.Message, Partials.Channel, Partials.Reaction]` to the client. Register:

```ts
client.on("messageReactionAdd", (reaction, user) =>
  void handleChatFeedbackReaction(reaction, user),
);
```

The handler must fetch partial reactions before reading message identity, or safely return/log if fetching fails.

- [ ] **Step 5: Remove obsolete button route and tests**

Remove `handleChatFeedbackButton` import and `chatfb_` branch from `src/events/interaction-create.ts`. Remove the obsolete button handler test/file if no other import remains. Keep unrelated AI moderation and job guard button routes unchanged.

- [ ] **Step 6: Run focused tests and commit**

Run: `bun test tests/unit/features/ai/chatbot.handler.test.ts tests/unit/features/ai/chat-feedback-reaction.handler.test.ts`

Expected: PASS.

Commit: `git add src/index.ts src/features/ai/handlers/chatbot.handler.ts src/events/interaction-create.ts src/features/ai tests/unit/features/ai && git commit -m "feat(ai): replace feedback buttons with reactions"`

### Task 4: Full verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Run full test suite**

Run: `bun test`

Expected: PASS with no failed tests.

- [ ] **Step 2: Run production build**

Run: `bun run build`

Expected: successful `tsdown` build with no TypeScript errors.

- [ ] **Step 3: Inspect final diff and status**

Run: `git status --short && git diff HEAD~3..HEAD --stat`

Expected: only reaction-feedback implementation, tests, and prior design/plan docs are included; unrelated `.codex/` remains untouched.
