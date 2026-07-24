# AI-Mod — Cross-channel sweep + sanction dedup

**Date:** 2026-07-21
**Status:** Approved design
**Parent spec:** `2026-07-20-ai-mod-design.md`

## Goal

Two small, related improvements to `ai-mod` (the mod-role-mention trigger in
`src/features/ai-mod/handlers/mod-mention.handler.ts`):

1. **Cross-channel sweep.** When ai-mod applies the 24h timeout via a mod
   mention, it must also delete the **other** messages of the same author that
   triggered the cross-channel duplicate-image detection (currently only the
   reported message is deleted; the cross-channel matches remain).
2. **Sanction dedup.** A user who has been sanctioned in the last 10 minutes
   must not produce additional log-channel alerts when subsequent mod
   mentions / cross-channel detections fire. Action still runs (delete,
   timeout); only the alert is suppressed.

## Non-goals

- No DB persistence of the dedup cache (in-memory, lost on restart — acceptable;
  worst case one extra alert on cold start).
- No changes to `monitorImages` (image auto-mod) — only the ai-mod
  mod-mention path.
- No extension of timeout duration for repeat offenders.
- No new commands or schema tables.

## Why

Today, a single spammy user posting the same scam image in three channels
causes three separate log alerts (one per channel scan) when mods ping the
bot. The first alert triggers a timeout + single-message delete; the next
two alerts re-flag the user, fire `safeTimeout` (no-op since already
disabled), and re-send the embed. This is the
`🚫 Spam/estafa detectado … canal: 👟╏running` /
`canal: 🎨╏frontend` spam the user reported. The cross-channel messages
themselves are also not swept — the user can re-post the image in those
channels even after the timeout starts ticking.

The new behavior: **one** alert per sanctioned user per 10-minute window;
**all** detected cross-channel messages deleted alongside the trigger.

## Architecture — additions to existing module

```
src/features/ai-mod/
  services/
    sanction-cache.service.ts   # NEW: in-memory TTL cache
    image-duplicate.service.ts  # CHANGED: return matchedMessages
  handlers/
    mod-mention.handler.ts      # CHANGED: group by author, consult cache, sweep
  index.ts                      # CHANGED: export SanctionCache + helper
```

No new event wiring, no new commands, no schema changes.

## `SanctionCache` — `src/features/ai-mod/services/sanction-cache.service.ts`

Static class. In-memory only.

```ts
interface CachedSanction {
  firstCaseId: number;
  firstChannelId: string;
  expiresAt: number; // ms epoch
}
```

API:
- `static get(guildId, authorId): CachedSanction | null`
  - Returns `null` if absent or expired. On expired entry, deletes the key
    (lazy eviction).
- `static set(guildId, authorId, firstCaseId, firstChannelId, ttlMs?): void`
  - Default TTL: **600 000 ms (10 min)**. Overridable for tests.
- `static prune(): void`
  - Iterates the map, deletes expired entries. Bounded: called at the end
    of every `set`; O(n) is fine — the map is small (one entry per
    sanctioned author per guild, capped by prune).
- `static _resetForTests(): void`
  - Clears the map. Exposed for tests only (underscore prefix to mark).

Key format: `guildId:authorId` (single string).

No persistence. No locking. Safe because Node is single-threaded and the
map is only mutated from `handleModMention` (single event handler).

## `ImageDuplicateService.checkImage` — return shape change

`src/features/ai-mod/services/image-duplicate.service.ts:49`

```ts
export interface ImageDuplicateResult {
  flagged: boolean;
  reason: string;
  matchedMessages: Message[]; // NEW: other author messages (excludes candidate) with same dhash
}
```

While scanning channels (existing loop at lines 71-100), accumulate the
messages that match the criteria into a local `matched: Message[]` array:

- For each scanned message `m`:
  - If `m.id === candidate.id` → skip (already counted as the candidate).
  - If `m.author.id !== candidateAuthorId` → skip (different author =
    viral meme, not spam).
  - If dhash matches one of `targetDhashes` → push `m` into `matched`.
    Break the inner URL loop (one match per message is enough, same as
    current behavior).
- If `matched.length >= 1` → return `{ flagged: true, reason:
  "imagen spam cross-channel", matchedMessages: matched }`.
- Else → `{ flagged: false, reason: "", matchedMessages: [] }`.

**Cap**: `matched.length` is bounded to **100** (drop the rest). Keeps the
resulting bulk-delete bounded to a single Discord API call per channel.
The 100 cap is documented in the function comment.

Existing tests that destructure the result must be updated to expect the
new field (default `[]`).

## `handleModMention` — refactor

`src/features/ai-mod/handlers/mod-mention.handler.ts:152-190`

Replace the "Act on each actionable candidate" loop with a per-author
grouping.

### New shape

1. **Group `actionable` by `message.author.id`** → `Map<authorId, FlaggedCandidate[]>`.
   - A single author may be flagged via both text and image routes in the
     same call (e.g. one text + one image). The existing loop would emit
     two alerts for the same author; the new shape emits one.

2. **For each `authorId` bucket**:
   - **Primary candidate** = the first element in the bucket (used for
     `caseId`, embed metadata, alert ping target).
   - **`allToDelete`** = flat set of message ids to delete:
     - The primary candidate's message.
     - Every other candidate's message in the bucket.
     - Every `matchedMessages` entry from the `ImageDuplicateService` result
       carried in the bucket (only present for the image-route candidate;
       de-duped by message id).
   - **`allCrossChannel`** = the union of `matchedMessages` across the
     bucket's image candidates (used for the cross-channel sweep helper).

3. **Cross-channel sweep (always runs)**:
   - Call `sweepCrossChannelMessages(guild, allCrossChannel)`.
   - This helper groups by `channelId`, calls `channel.bulkDelete` for
     messages younger than 14 days, and `safeDelete` per message for
     older ones. Failures are logged, never thrown.
   - Runs in both the cache-MISS and cache-HIT paths.

4. **Cache check**:
   - `cached = SanctionCache.get(guildId, authorId)`.
   - **HIT**:
     - `safeTimeout` on the author (idempotent — `isCommunicationDisabled`
       → `action_already_timeout` label).
     - `safeDelete` for each message in `allToDelete` (including
       cross-channel — covered above).
     - **Skip** `CasesService.insert` and `sendFlaggedAlert`.
   - **MISS**:
     - `safeTimeout` (same logic).
     - `safeDelete` for each message in `allToDelete`.
     - `caseId = await CasesService.insert(...)` using the primary
       candidate's fields (existing payload).
     - `await sendFlaggedAlert(...)` (existing helper).
     - `SanctionCache.set(guildId, authorId, caseId, primary.message.channelId)`.
     - If **any** candidate in the bucket has `fromImage === true`, call
       `persistScamImage(guildId, thatCandidate.message)` for each
       image-flagged candidate — so monitorImages catches all of them
       next time. Dedupe on `(guildId, image-url)` is already handled
       inside `persistScamImage` (existing `ImageService.addImage` insert
       collision is swallowed).

### `sweepCrossChannelMessages` helper

New function in the same file (private):

```ts
async function sweepCrossChannelMessages(
  guild: Guild,
  messages: Message[],
): Promise<void> {
  // Group by channelId, dedupe ids, split young (<14d) vs old.
  // For each channel:
  //   await channel.bulkDelete(young.map(m => m.id)).catch(...)
  //   await Promise.all(old.map(m => safeDelete(m)))
}
```

Reuses the existing `safeDelete` import from `@/core/discord/moderation`.
`bulkDelete` swallows permission errors via `.catch` and logs at warn.

## Data flow — example scenarios

### Scenario A: same user, image in 3 channels, mod mentions in channel 1

- `candidates` from channel 1 → 1 image candidate.
- `ImageDuplicateService.checkImage` → `{flagged:true, reason, matchedMessages:[msgInCh2, msgInCh3]}`.
- Bucket: `{authorId: u, [imageCandidate]}`.
- Cross-channel sweep: deletes `msgInCh2`, `msgInCh3` (in addition to
  channel-1's image via the standard delete in the MISS path).
- Cache MISS → timeout + delete + case row + alert (single).
- `SanctionCache.set(guildId, u, caseId, channel1)`.

### Scenario B: same user posts new image in channel 4, mod mentions in channel 4

- Image candidate → `checkImage` → maybe 1-3 matches across channels.
- Cache HIT (within 10 min) → timeout (idempotent) + delete (incl.
  cross-channel sweep) + **no** case row + **no** alert.
- User sees: log channel silent. Channel 1 alert is the only notification.

### Scenario C: text + image flagged in same call, same author

- One text candidate (v=1) + one image candidate (cross-channel).
- Bucket: `{authorId: u, [textCandidate, imageCandidate]}`.
- Primary = textCandidate (first in bucket).
- `allToDelete` = both messages + `matchedMessages` from the image route.
- Cache MISS → one case row (using primary's text) + one alert.

## Edge cases

| Situation | Behavior |
|---|---|
| Cross-channel match in an ignored channel | `checkImage` already skips ignored channels (existing logic). No new code. |
| Cross-channel match was the trigger of a prior mod mention | The prior call's `SanctionCache.set` makes the later call a HIT → no duplicate alert. |
| Cross-channel match is a message the bot cannot delete (perms) | `bulkDelete` / `safeDelete` log warn, continue. |
| 100+ cross-channel matches | First 100 retained; rest ignored. Sweep is best-effort. |
| Message already deleted by user before sweep | `safeDelete` / `bulkDelete` no-op. |
| Bot restart between mod mentions | Cache lost → one extra alert on the next mod mention. Acceptable. |
| Two simultaneous mod mentions in different channels (race) | Node single-threaded; `handleModMention` is awaited sequentially. No race. |
| `matchedMessages` includes a message by a different author | `checkImage` filter guarantees only same-author matches. |
| Action timeout fails (no perms) | `safeTimeout` returns false → `action_no_permission` label. Same as today. Alert still fires on MISS; suppressed on HIT. |

## Testing (`tests/unit/features/ai-mod/`)

- `sanction-cache.test.ts`:
  - `set` then `get` within TTL → returns entry.
  - `get` after TTL expiry → returns null, evicts key.
  - different `(guildId, authorId)` keys isolated.
  - `prune` removes only expired entries.
  - `_resetForTests` clears map.
- `image-duplicate-matched.test.ts`:
  - same-author match → `flagged=true`, `matchedMessages` contains the
    other message.
  - distinct-author match → `flagged=false`, `matchedMessages=[]`.
  - 100-cap: 150 matches across channels → `matchedMessages.length === 100`.
  - ignored channel not scanned → not in `matchedMessages`.
- `mod-mention-crosschannel.test.ts`:
  - 2 cross-channel matches + 1 trigger → 1 alert, 1 case row, 3 deletes
    (trigger + 2 cross), cache populated.
  - same author in a 2nd call within TTL → 0 alerts, 0 new case rows,
    but new messages still deleted.
  - text + image flagged for same author in one call → 1 alert, 1 case.
  - 3 channels, 5 matches total → 1 alert, 1 case, 6 deletes.
  - cache TTL expiry → next call is MISS, 1 alert.

Existing `mod-mention.handler.test.ts`, `image-duplicate.service.test.ts`
need minimal updates to consume the new `matchedMessages` field (default
`[]` is fine for non-cross-channel cases).

## Files touched

| File | Change |
|---|---|
| `src/features/ai-mod/services/sanction-cache.service.ts` | NEW (~60 lines) |
| `src/features/ai-mod/services/image-duplicate.service.ts` | Return `matchedMessages`; cap at 100 |
| `src/features/ai-mod/handlers/mod-mention.handler.ts` | Group by author, consult cache, sweep cross-channel, single alert per bucket |
| `src/features/ai-mod/index.ts` | Export `SanctionCache` |
| `tests/unit/features/ai-mod/sanction-cache.test.ts` | NEW |
| `tests/unit/features/ai-mod/image-duplicate-matched.test.ts` | NEW (or extend existing) |
| `tests/unit/features/ai-mod/mod-mention-crosschannel.test.ts` | NEW (or extend existing) |

No new env vars. No schema changes. No new i18n keys (alert texts
unchanged; new behavior is about *whether* to send, not *what* to send).

## Out of scope (deliberate)

- Persisting `SanctionCache` to DB.
- `monitorImages` integration with the cache.
- Per-guild configurable TTL.
- Tracking cross-channel deletions in the case row (the case row's
  `messageId` stays the primary trigger; cross-channel deletions are
  implicit from the alert's "Action" field).
- Bulk-deleting across multiple channels in a single API call (Discord
  doesn't support it; we use one `bulkDelete` per channel).
