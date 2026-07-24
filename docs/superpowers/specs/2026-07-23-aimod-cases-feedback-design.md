# AI-Mod — Case listing + mandatory prompt on feedback

**Date:** 2026-07-23  
**Status:** Approved design  
**Parent spec:** `2026-07-20-ai-mod-design.md`

## Goal

Two related improvements to `ai-mod` (includes selfpromo as `verdict=2`):

1. **Case listing / detail.** Mods can inspect cases via Discord commands instead of only log-channel embeds or the DB.
2. **Mandatory prompt on feedback.** Correcto/Incorrecto must not mark a case `resolved` until an AI learning prompt is generated and saved. If the AI is down/misconfigured, side-effects still apply and buttons stay clickable for retry.

## Non-goals

- Automatic retry / prompt queue when AI recovers.
- Web dashboard.
- Changes to classify-fail → precaution path.
- Discord listing of selfpromo bypass channels.

## Why

Today, clicking Correcto/Incorrecto always calls `markResolved` even when `FeedbackService` returns `null` (missing env, HTTP error, timeout). The example corpus is updated, but no row is written to `ai_mod_ai_prompts`, and buttons are disabled — so the learning note is lost and cannot be retried from Discord.

There is also no `CasesService.list` / command; cases are only discoverable via the log channel footer (`case_id: N`) or Drizzle Studio.

## Decisions

| Topic | Choice |
|-------|--------|
| Resolve gate | `resolved=true` only if prompt generated **and** saved |
| Incorrect side-effects | Always: negative example + remove timeout (if present) |
| Correct side-effects | Always: positive example; **never** remove timeout |
| On AI / save failure | `promptPending=true`, keep buttons, ephemeral explains retry |
| Listing UX | `m!aimod cases [pending\|resolved\|all] [page]` + `m!aimod case <id>` |
| Selfpromo | Same tables/handlers (no separate feature) |

## Schema additions (`ai_mod_cases`)

```ts
feedbackAction: text("feedback_action"), // "correct" | "incorrect" | null
promptPending: integer("prompt_pending", { mode: "boolean" }).notNull().default(false),
promptError: text("prompt_error"),
```

Existing rows: defaults keep prior behavior until feedback is clicked again (already-resolved cases stay resolved).

## Feedback flow

1. Auth (ManageMessages / mod role / notify target) — unchanged.
2. Load case; if `resolved` → early return.
3. Apply side-effects for the clicked action (idempotent via `addIfAbsent`).
4. Generate + save prompt.
5. **Success:** `markResolved` (clears `promptPending` / `promptError`), disable buttons, append note on alert.
6. **Failure:** `markFeedbackPending(action, error)`, **do not** disable buttons; ephemeral includes “prompt pending — retry”.

Retry uses the same button customIds (`aimod_<id>_correct|incorrect`). On retry, timeout removal only runs if the member is still communication-disabled.

## CasesService API

- `list(guildId, filter, limit, offset)` — `pending` = `resolved=false`
- `count(guildId, filter)`
- `markFeedbackPending(id, by, action, error?)`
- `markResolved` — also sets `promptPending=false`, `promptError=null`, and `feedbackAction`

## Commands

Extend `m!aimod` (same perms: ManageGuild / superdev):

- `cases [pending|resolved|all] [page]` — default filter `pending`, page size 10
- `case <id>` — detail; must belong to the guild

## i18n

Update `usage_aimod`; add keys for list empty/header/row, case detail fields, and feedback pending / retry messaging (es + en).

## Testing

- AI null → side-effects yes, not resolved, buttons kept
- AI ok → resolved + buttons disabled
- Retry after pending → resolve; no duplicate example
- Incorrect + AI fail → timeout removed + pending
- Correct never removes timeout
- cases / case command filters, pagination, guild mismatch
