# Job Guard — staff bypass + feedback learning

**Date:** 2026-07-25  
**Status:** Approved design  
**Related:** `2026-07-12-job-guard-ai-moderation-design.md`, `2026-07-23-aimod-cases-feedback-design.md`

## Goal

1. **Staff bypass:** AI must not classify or delete messages from members with
   `ManageMessages` (mods posting channel rules were being deleted).
2. **Feedback learning for job-guard:** Same Correct/Incorrect flow as ai-mod,
   with **separate tables** so prompts never mix with ai-mod context.
3. **Portfolio / autopromo:** Keep allowing self-promo with portfolio/CV/GitHub
   via a stronger base prompt + learned feedback notes (no heuristic allow-list).

## Non-goals

- No shared/generic `ai_prompts` table with a `system` column.
- No hard-coded allow for portfolio URL domains.
- No special handling for attachment-only CV posts (still skipped when content
  is empty — unchanged).
- No i18n for job-guard alert/feedback copy (Spanish hardcoded, same as today).
- No change to `monitorImages` (already skips `ManageMessages`).

## Problem (concrete)

A mod posted in `#busco-trabajo`:

> Por favor, no evitar conversaciones por aquí, el mod les va a eliminar los mensajes.

Job-guard classified it as `block` (95%) with reason *“mensaje de advertencia
que no está permitido”* and deleted it. Correct relative to “only autopromo”,
wrong relative to staff. Bypass the author before calling the classifier.

## Architecture

### Staff bypass — all AI message entry points that act on authors

| Entry point | Change |
|-------------|--------|
| `job-guard` `enforceJobGuard` | If `message.member?.permissions.has(ManageMessages)` → return (no AI, no delete). |
| `ai-mod` `resolveCandidates` / candidate loop | Skip candidate messages whose author has `ManageMessages`. Keep existing early return when the **reporter** has `ManageMessages`. |
| `monitorImages` | Already skips moderators — no change. |

Use Discord `PermissionFlagsBits.ManageMessages` (same pattern as
`handleModMention` / `monitorImages`).

### Feedback — new tables (mirror ai-mod, isolated)

```
src/db/schema/job-guard.ts          # NEW
src/features/job-guard/
  handlers/enforce.handler.ts       # case insert + feedback buttons
  handlers/feedback-button.handler.ts  # NEW
  services/cases.service.ts         # NEW
  services/prompts.service.ts       # NEW
  services/feedback.service.ts      # NEW (TP / anti-FP notes for allow|block)
  services/classifier.service.ts    # inject learned prompts; tighten base prompt
```

Wire buttons in `src/events/interaction-create.ts`:

```ts
if (interaction.customId.startsWith("jobguard_")) {
  await handleJobGuardFeedbackButton(interaction);
}
```

### Schema

**`job_guard_cases`**

| Column | Notes |
|--------|-------|
| `id` | PK autoincrement |
| `guild_id` | not null |
| `author_id` | not null |
| `channel_id` | not null |
| `message_id` | not null |
| `content` | original text (truncated as needed) |
| `verdict` | text `"allow"` \| `"block"` (job-guard uses strings, not ai-mod ints) |
| `confidence` | real 0..1 |
| `reason` | AI reason |
| `deleted` | boolean — whether message was deleted |
| `resolved` | boolean default false |
| `resolved_by` | optional |
| `resolved_action` | `"correct"` \| `"incorrect"` |
| `resolved_at` | timestamp |
| `feedback_action` | optional (pending path) |
| `prompt_pending` | boolean default false |
| `prompt_error` | optional |
| `created_at` | timestamp |

**`job_guard_prompts`**

| Column | Notes |
|--------|-------|
| `id` | PK autoincrement |
| `guild_id` | not null |
| `prompt` | learned note text |
| `created_at` | timestamp |

Do **not** write to `ai_mod_ai_prompts`.

## Flow — enforce

1. Feature disabled / wrong channel / no guild → return.
2. **Author has `ManageMessages` → return.**
3. Empty content → return.
4. `classify(content, guildId)` (prompts injected inside).
5. If not `ok` or not `block` → return.
6. Delete if confidence ≥ 0.8.
7. `CasesService.insert(...)` → `caseId`.
8. Mod alert embed + buttons:
   - `jobguard_<caseId>_correct`
   - `jobguard_<caseId>_incorrect`

## Flow — feedback button

Permission: clicker must have `ManageMessages` (same bar as “staff who can
delete”). No need to couple to ai-mod mod_roles/notify_targets unless we later
want parity; YAGNI for v1.

1. Parse `jobguard_<id>_<correct|incorrect>`.
2. Ephemeral ack.
3. Load case; if missing/resolved → stop.
4. Generate note via `FeedbackService` (TP if correct, anti-FP if incorrect),
   with user payload using job-guard verdict vocabulary (`allow`/`block`).
5. On success: insert `job_guard_prompts`, mark case resolved, disable buttons.
6. On AI/save failure: `prompt_pending` + error (mirror ai-mod); do not lose the
   mod’s vote.

Incorrect does **not** need to restore the deleted message (Discord cannot
undelete). Optional note in the ephemeral summary that the original was already
removed — mods can re-post if needed. No timeout to clear (job-guard does not
timeout users).

## Classifier — learning + portfolio wording

`classify(content, guildId)`:

1. Load last `MAX_PROMPTS` (10) rows from `job_guard_prompts` for that guild,
   newest first (same style as ai-mod `ContextBuilder`).
2. Append to system prompt under a `Notas de moderadores:` section (or empty if
   none).
3. Tighten base system prompt so `allow` explicitly covers:
   - self-promo with skills / experience / availability
   - links to **own** portfolio, CV, GitHub, LinkedIn, personal site
4. Keep injection hardening and JSON-only output unchanged.
5. Still **only** `block` for hiring/recruiting offers; do not invent a third
   verdict for “off-topic chat” that deletes staff — staff never reach here.

## Error handling

- Classification failure → no delete, no case (current behavior).
- Insert case **before** sending the alert so button customIds always have a
  valid id; if alert send fails after delete → log warn (current).
- Feedback AI/save failure → `prompt_pending`, **do not** disable buttons
  (retry via same customIds; match ai-mod).

## Testing

- Enforce: author with `ManageMessages` → no classify, no delete.
- Enforce: block + high confidence → delete + case + buttons on alert.
- Feedback: correct → prompt row + case resolved; incorrect → anti-FP prompt.
- Classifier: when prompts exist, they appear in the AI system/user context
  (assert via mocked chat args).
- `resolveCandidates` / ai-mod: candidate with `ManageMessages` skipped.
- Portfolio: unit/fixtures only via prompt text assertion (no live LLM).

## Deliberate simplifications (ponytail)

- Separate tables instead of typed shared prompts.
- Feedback permission = `ManageMessages` only.
- No message restore on incorrect.
- No attachment-only CV path.
- Spanish-only job-guard UI strings.
