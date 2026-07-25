# AI Mod Harden — act always, wait in background, smarter image scenarios

**Date:** 2026-07-24  
**Status:** Approved design  
**Approach:** In-place harden of `ai-mod` (Enfoque 1). Does not change `monitorImages`, puff, reports, or `messageCreate` short-circuit.

## Goal

When a user mentions a configured mod role, the bot must:

1. Wait for the LLM in the background (high timeout ceiling; latency is fine).
2. Prefer **timeout + delete + notify + feedback buttons** over passive “precaution” alerts.
3. Handle novel scam images (not yet in the curated `images` DB) without leaving the suspicious message up.
4. Keep learning via the existing Correct/Incorrect feedback loop.

Known scam images in the DB remain the job of `monitorImages` (passive). Manual sweeps remain puff / report quorum.

## Non-goals

- Passive / hybrid always-on AI scanning.
- Persistent job queue in DB.
- Pipeline short-circuit after other features delete a message.
- Fixing `monitorImages` requiring a log channel to act.
- Command to configure candidate window `N`.
- Deep prompt rewrite.
- Merging `job-guard` into `ai-mod`.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Trigger | Mod-role mention only |
| Candidates | Reply if present; else last N (default 10), exclude reporter/bots |
| AI wait | Fire-and-forget after cheap gates; `AI_TIMEOUT_MS = 180000` |
| Text confidence | Any `v ≠ 0` with `c ≥ 0.5` → act; embed shows high/low band (visual cut at 0.8) |
| AI failure | Still timeout + delete text candidates + alert + feedback (fallback reason) |
| Image (novel) | ≥3 distinct channels (same author, same dhash) → sweep; else still timeout+delete candidate; always alert+feedback+persist |
| Image (known DB) | Out of scope — `monitorImages` |
| Selfpromo bypass | Unchanged (`v=2` + p∈{1,2,3} + bypass channel → skip) |
| ManageMessages reporter | Unchanged (no trigger) |

## Scenario table

| ID | Situation | Action |
|----|-----------|--------|
| T1 | Text clean (`v=0`) | Nothing |
| T2 | Text flag `c ≥ 0.8` | Timeout 24h + delete + alert (high confidence) + feedback |
| T3 | Text flag `0.5 ≤ c < 0.8` | Same as T2; embed marks **low confidence** |
| T4 | AI fails after wait | Timeout + delete text candidates + alert “AI failed / fallback” + feedback |
| I1 | Image; same dhash + same author in ≥3 channels | Timeout + sweep matches + persist + alert + feedback |
| I2 | Image; &lt;3 channels | Timeout + delete candidate + persist + alert (“no spread”) + feedback |
| I3 | Image already in curated DB | `monitorImages` (not ai-mod) |
| X1 | Selfpromo bypass channel | Skip |
| X2 | Reporter has ManageMessages | No trigger |

## Architecture changes

### `AIClientService`

- Raise `AI_TIMEOUT_MS` from 15s to 180s.
- Shared by `job-guard` (acceptable for private single-server).

### `message-create`

- Keep calling `handleModMention`, but do not block the rest of the pipeline on LLM/scan work:
  `void handleModMention(message).catch(...)`.
- Cheap early returns stay inside `handleModMention`.

### `ImageDuplicateService`

- Count distinct `channelId`s for same-author dhash matches (candidate channel counts as 1).
- `flagged === true` iff `channelCount ≥ 3`.
- Always return `channelCount`, `matchedMessages`, `reason`.

### `handleModMention`

- Remove “borderline → precaution only” band for text (`c < 0.8`).
- AI failure → push text candidates into **actionable** (not precaution).
- Image route: always actionable; attach `crossChannelMessages` only when `flagged`.
- Precaution path may remain for edge cases but should not be the normal image/AI-fail path.

### Alerts / i18n

- Flagged embed includes confidence band label (high/low).
- New strings: AI fallback reason, image no-spread reason, confidence band labels (es/en).

## Files

- `src/features/ai-mod/services/ai-client.service.ts`
- `src/features/ai-mod/services/image-duplicate.service.ts`
- `src/features/ai-mod/handlers/mod-mention.handler.ts`
- `src/features/ai-mod/services/alert-builder.service.ts`
- `src/events/message-create.ts`
- `src/i18n/es.ts`, `src/i18n/en.ts`
- Unit tests under `tests/unit/features/ai-mod/`

## Testing

- Image duplicate: 2 channels → not flagged; 3 channels → flagged.
- Handler: mid-confidence deletes; AI fail deletes + cases; image unflagged still deletes.
- Client: timeout constant / abort behavior covered by existing or updated unit test.
- Existing bypass / ManageMessages / feedback regressions stay green.
