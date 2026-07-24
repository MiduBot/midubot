# AI-Mod Cross-Channel Sweep + Sanction Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When ai-mod applies a 24h timeout, also delete the cross-channel image-duplicate matches and dedupe log alerts to one per sanctioned user per 10-minute window.

**Architecture:** In-memory `SanctionCache` keyed by `guildId:authorId` with 10-min TTL. `ImageDuplicateService.checkImage` now returns the list of matched cross-channel messages. `handleModMention` groups `actionable` candidates by author, consults the cache, sweeps matched messages, and emits at most one alert per author per call.

**Tech Stack:** TypeScript, Bun, discord.js v14, existing in-memory mocks pattern.

**Spec:** `docs/superpowers/specs/2026-07-21-aimod-crosschannel-sweep-design.md`

## Global Constraints

- Path alias: `@/*` → `./src/*` (existing).
- Tests: Bun test runner, mocks in `tests/mocks/`, prepend `tests/setup.ts` via bun preload.
- No new DB schema. No new env vars. No new i18n keys.
- Existing `image-duplicate.service.ts` tests at `tests/unit/features/ai-mod/image-duplicate.service.test.ts` must keep passing after Task 2 changes the return shape (default `matchedMessages: []` is acceptable for existing tests).
- No comments unless necessary; match existing code style.
- TDD: write failing test first, then implementation, then commit.

---

## File Structure

| File | Change |
|---|---|
| `src/features/ai-mod/services/sanction-cache.service.ts` | NEW: in-memory TTL cache |
| `src/features/ai-mod/services/image-duplicate.service.ts` | MODIFIED: return `matchedMessages` capped at 100 |
| `src/features/ai-mod/handlers/mod-mention.handler.ts` | MODIFIED: group by author, consult cache, sweep, single alert per bucket |
| `src/features/ai-mod/index.ts` | MODIFIED: export `SanctionCache` |
| `tests/unit/features/ai-mod/sanction-cache.test.ts` | NEW |
| `tests/unit/features/ai-mod/image-duplicate-matched.test.ts` | NEW: 100-cap + matchedMessages exposure |
| `tests/unit/features/ai-mod/mod-mention-crosschannel.test.ts` | NEW: end-to-end grouping + dedup |

---

### Task 1: SanctionCache — in-memory TTL cache

**Files:**
- Create: `src/features/ai-mod/services/sanction-cache.service.ts`
- Modify: `src/features/ai-mod/index.ts` (add export)
- Test: `tests/unit/features/ai-mod/sanction-cache.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface CachedSanction { firstCaseId: number; firstChannelId: string; expiresAt: number; }
  class SanctionCache {
    static get(guildId: string, authorId: string): CachedSanction | null;
    static set(guildId: string, authorId: string, firstCaseId: number, firstChannelId: string, ttlMs?: number): void;
    static prune(): void;
    static _resetForTests(): void;
  }
  ```
- Default `ttlMs = 600_000` (10 min). No persistence. `get` lazily evicts expired keys. `set` calls `prune()` at the end. `_resetForTests` clears the map.

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/sanction-cache.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { SanctionCache } from "@/features/ai-mod/services/sanction-cache.service";

beforeEach(() => SanctionCache._resetForTests());

describe("SanctionCache", () => {
  it("returns null for an unknown key", () => {
    expect(SanctionCache.get("g1", "u1")).toBeNull();
  });

  it("returns the entry within TTL", () => {
    SanctionCache.set("g1", "u1", 42, "c1");
    const v = SanctionCache.get("g1", "u1");
    expect(v).not.toBeNull();
    expect(v?.firstCaseId).toBe(42);
    expect(v?.firstChannelId).toBe("c1");
    expect(v!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns null after TTL expires and evicts the key", async () => {
    SanctionCache.set("g1", "u1", 1, "c1", 10);
    await new Promise((r) => setTimeout(r, 25));
    expect(SanctionCache.get("g1", "u1")).toBeNull();
    expect(SanctionCache.get("g1", "u1")).toBeNull();
  });

  it("isolates entries by guildId and authorId", () => {
    SanctionCache.set("g1", "u1", 1, "c1");
    SanctionCache.set("g1", "u2", 2, "c2");
    SanctionCache.set("g2", "u1", 3, "c3");
    expect(SanctionCache.get("g1", "u1")?.firstCaseId).toBe(1);
    expect(SanctionCache.get("g1", "u2")?.firstCaseId).toBe(2);
    expect(SanctionCache.get("g2", "u1")?.firstCaseId).toBe(3);
    expect(SanctionCache.get("g2", "u2")).toBeNull();
  });

  it("prune removes expired entries and keeps live ones", async () => {
    SanctionCache.set("g1", "u1", 1, "c1", 10);
    SanctionCache.set("g1", "u2", 2, "c2", 10_000);
    await new Promise((r) => setTimeout(r, 25));
    SanctionCache.set("g1", "u3", 3, "c3", 10_000);
    SanctionCache.prune();
    expect(SanctionCache.get("g1", "u1")).toBeNull();
    expect(SanctionCache.get("g1", "u2")).toBeNull();
    expect(SanctionCache.get("g1", "u3")?.firstCaseId).toBe(3);
  });

  it("_resetForTests clears the map", () => {
    SanctionCache.set("g1", "u1", 1, "c1");
    SanctionCache._resetForTests();
    expect(SanctionCache.get("g1", "u1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `bun test tests/unit/features/ai-mod/sanction-cache.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement SanctionCache**

`src/features/ai-mod/services/sanction-cache.service.ts`:

```ts
export interface CachedSanction {
  firstCaseId: number;
  firstChannelId: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 600_000;
const store = new Map<string, CachedSanction>();

function key(guildId: string, authorId: string): string {
  return `${guildId}:${authorId}`;
}

export class SanctionCache {
  static get(guildId: string, authorId: string): CachedSanction | null {
    const k = key(guildId, authorId);
    const v = store.get(k);
    if (!v) return null;
    if (v.expiresAt <= Date.now()) {
      store.delete(k);
      return null;
    }
    return v;
  }

  static set(
    guildId: string,
    authorId: string,
    firstCaseId: number,
    firstChannelId: string,
    ttlMs: number = DEFAULT_TTL_MS,
  ): void {
    store.set(key(guildId, authorId), {
      firstCaseId,
      firstChannelId,
      expiresAt: Date.now() + ttlMs,
    });
    SanctionCache.prune();
  }

  static prune(): void {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k);
    }
  }

  static _resetForTests(): void {
    store.clear();
  }
}
```

- [ ] **Step 4: Run the test (expect pass)**

Run: `bun test tests/unit/features/ai-mod/sanction-cache.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Export from barrel**

Edit `src/features/ai-mod/index.ts`: add `export { SanctionCache } from "./services/sanction-cache.service";` in the services block (alphabetical, before `SelfpromoBypassService`).

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-mod/services/sanction-cache.service.ts \
        src/features/ai-mod/index.ts \
        tests/unit/features/ai-mod/sanction-cache.test.ts
git commit -m "feat(ai-mod): add SanctionCache with 10min TTL"
```

---

### Task 2: ImageDuplicateService — return matchedMessages

**Files:**
- Modify: `src/features/ai-mod/services/image-duplicate.service.ts:9-106`
- Test: `tests/unit/features/ai-mod/image-duplicate-matched.test.ts` (NEW, separate from existing)

**Interfaces:**
- Produces (modified):
  ```ts
  interface ImageDuplicateResult {
    flagged: boolean;
    reason: string;
    matchedMessages: Message[]; // NEW
  }
  ```
- Cap `matchedMessages.length` to `MAX_MATCHES = 100`.

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/image-duplicate-matched.test.ts`:

```ts
import { describe, it, expect, mock } from "bun:test";
import type { Guild, Message } from "discord.js";

mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: async () => false,
}));

mock.module("@/features/images", () => ({
  ImageHashService: {
    downloadFingerprint: mock(async (url: string) =>
      url.includes("imgA") ? { dhash: "DHASH_A" } : null,
    ),
  },
}));

import { ImageDuplicateService } from "@/features/ai-mod/services/image-duplicate.service";

function makeMessage(id: string, authorId: string, url: string): Message {
  return {
    id,
    author: { id: authorId, bot: false } as never,
    content: "",
    attachments: new Map([["a", { url, contentType: "image/png" }]]) as never,
    channel: { id: "c1" } as never,
  } as unknown as Message;
}

function makeGuild(messagesByChannel: Record<string, Message[]>): Guild {
  const channels = new Map();
  for (const [cid, msgs] of Object.entries(messagesByChannel)) {
    const map = new Map(msgs.map((m) => [m.id, m]));
    channels.set(cid, {
      id: cid,
      type: 0,
      viewable: true,
      messages: { fetch: async () => map },
    });
  }
  return {
    id: "g1",
    channels: { cache: channels, fetch: async () => new Map(channels) },
  } as unknown as Guild;
}

describe("ImageDuplicateService.checkImage — matchedMessages", () => {
  it("includes the other same-author match in matchedMessages", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png");
    const other = makeMessage("m1", "spammer", "https://x/imgA.png");
    const guild = makeGuild({ c1: [candidate], c2: [other] });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(true);
    expect(r.matchedMessages).toHaveLength(1);
    expect(r.matchedMessages[0].id).toBe("m1");
  });

  it("returns empty matchedMessages when only the candidate has the image", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png");
    const guild = makeGuild({ c1: [candidate] });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.matchedMessages).toEqual([]);
  });

  it("excludes matches from different authors", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png");
    const guild = makeGuild({
      c1: [candidate],
      c2: [makeMessage("m1", "other", "https://x/imgA.png")],
    });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.matchedMessages).toEqual([]);
  });

  it("caps matchedMessages at 100 even with more matches", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png");
    const others: Message[] = [];
    for (let i = 1; i <= 150; i++) {
      others.push(makeMessage(`m${i}`, "spammer", "https://x/imgA.png"));
    }
    const channels: Record<string, Message[]> = { c1: [candidate] };
    for (let i = 0; i < 150; i++) {
      channels[`c${i + 2}`] = [others[i]];
    }
    const guild = makeGuild(channels);
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(true);
    expect(r.matchedMessages).toHaveLength(100);
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `bun test tests/unit/features/ai-mod/image-duplicate-matched.test.ts`
Expected: FAIL — `r.matchedMessages` is `undefined` (current interface has no such field).

- [ ] **Step 3: Update ImageDuplicateService**

Edit `src/features/ai-mod/services/image-duplicate.service.ts`:

1. Replace the interface block (lines 11-14) with:

```ts
const MAX_MATCHES = 100;

export interface ImageDuplicateResult {
  flagged: boolean;
  reason: string;
  matchedMessages: Message[];
}
```

2. Inside `checkImage` (around line 67-100), replace the local-scope logic. The function body becomes:

```ts
export class ImageDuplicateService {
  static async checkImage(
    guild: Guild,
    candidate: Message,
  ): Promise<ImageDuplicateResult> {
    const urls = await candidateImageUrls(candidate);
    if (urls.length === 0) {
      return { flagged: false, reason: "", matchedMessages: [] };
    }

    const targetDhashes = new Set<string>();
    for (const url of urls) {
      try {
        const fp = await ImageHashService.downloadFingerprint(url);
        if (fp) targetDhashes.add(fp.dhash);
      } catch {
        // ignore
      }
    }
    if (targetDhashes.size === 0) {
      return { flagged: false, reason: "", matchedMessages: [] };
    }

    const candidateAuthorId = candidate.author.id;
    const matched: Message[] = [];
    let sameAuthorHits = 1; // the candidate itself

    const channels = await collectTextChannels(guild);
    for (const channel of channels) {
      if (matched.length >= MAX_MATCHES) break;
      try {
        const fetched = await (channel as { messages: { fetch: (o: unknown) => Promise<Map<string, Message>> } }).messages.fetch({
          limit: SCAN_MESSAGES_PER_CHANNEL,
        });
        for (const [, msg] of fetched) {
          if (matched.length >= MAX_MATCHES) break;
          if (msg.id === candidate.id) continue;
          const msgUrls: string[] = [];
          for (const att of msg.attachments.values()) {
            if (att.contentType?.startsWith("image/")) msgUrls.push(att.url);
          }
          msgUrls.push(...extractImageUrls(msg.content));
          for (const url of msgUrls) {
            try {
              const fp = await ImageHashService.downloadFingerprint(url);
              if (fp && targetDhashes.has(fp.dhash)) {
                if (msg.author.id === candidateAuthorId) {
                  sameAuthorHits++;
                  if (matched.length < MAX_MATCHES) matched.push(msg);
                }
                break;
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (e) {
        logger.warn(`image-duplicate: failed to scan channel: ${e}`);
      }
    }

    if (sameAuthorHits >= 2) {
      return { flagged: true, reason: "imagen spam cross-channel", matchedMessages: matched };
    }
    return { flagged: false, reason: "", matchedMessages: [] };
  }
}
```

- [ ] **Step 4: Run all image-duplicate tests (expect pass)**

Run: `bun test tests/unit/features/ai-mod/image-duplicate.service.test.ts tests/unit/features/ai-mod/image-duplicate-matched.test.ts`
Expected: PASS for both files. (Existing tests pass because the new field defaults to `[]` on the non-matching paths they exercise.)

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-mod/services/image-duplicate.service.ts \
        tests/unit/features/ai-mod/image-duplicate-matched.test.ts
git commit -m "feat(ai-mod): return matchedMessages from checkImage, cap at 100"
```

---

### Task 3: handleModMention — cross-channel sweep + sanction dedup

**Files:**
- Modify: `src/features/ai-mod/handlers/mod-mention.handler.ts:152-190`
- Test: `tests/unit/features/ai-mod/mod-mention-crosschannel.test.ts` (NEW)

**Interfaces:**
- Consumes: `SanctionCache` (Task 1), `ImageDuplicateResult.matchedMessages` (Task 2), `CasesService.insert`, `LogChannelService.getLogChannel`, `NotifyTargetsService.list`, `safeDelete`, `safeTimeout`, `bulkDelete` on `TextChannel`.
- Produces (private): `sweepCrossChannelMessages(guild, messages)`.

Behavior:
- Group `actionable` by `authorId`. For each bucket:
  - Build `allToDelete: Set<string>` = primary + bucket members + cross-channel matches.
  - `allCrossChannel: Message[]` = union of `matchedMessages` from image-route candidates in the bucket.
  - Always run `sweepCrossChannelMessages(guild, allCrossChannel)`.
  - Always `safeTimeout` (idempotent).
  - Always `safeDelete` each `allToDelete` id.
  - Always `persistScamImage` for every image-flagged candidate in the bucket.
  - Cache check: HIT → skip `CasesService.insert` + `sendFlaggedAlert`. MISS → run them, then `SanctionCache.set`.

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/mod-mention-crosschannel.test.ts`:

```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";

const envMock = {
  AI_API_URL: "https://ai.test/v1/chat/completions",
  AI_API_KEY: "k",
  AI_MODEL: "m",
  JOB_CHANNEL_ID: "",
  DISCORD_PREFIX: "m!",
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "c",
  TURSO_CONNECTION_URL: "file::memory:",
  TURSO_AUTH_TOKEN: "t",
  NODE_ENV: "test",
  LOG_LEVEL: "error",
};
mock.module("@/config/env", () => ({ env: envMock }));

const configMock = { isEnabled: mock(async () => true) };
const modRoleMock = { hasRole: mock(async () => true) };
const bypassMock = { isBypass: mock(async () => false) };
const notifyMock = { list: mock(async () => []) };
const contextMock = { buildContext: mock(async () => ({ examples: "", prompts: "" })) };
const casesMock = { insert: mock(async () => 99) };
const logChannelMock = { getLogChannel: mock(async () => "log-1") };
const imagesMock = {
  ImageService: { addImage: mock(async () => {}) },
  ImageHashService: { downloadFingerprint: mock(async () => null) },
};

mock.module("@/features/ai-mod/services/ai-mod-config.service", () => ({ AiModConfigService: configMock }));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({ ModRoleService: modRoleMock }));
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({ SelfpromoBypassService: bypassMock }));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({ NotifyTargetsService: notifyMock }));
mock.module("@/features/ai-mod/services/context-builder.service", () => ({ ContextBuilderService: contextMock }));
mock.module("@/features/ai-mod/services/cases.service", () => ({ CasesService: casesMock }));
mock.module("@/features/log-channel", () => ({ LogChannelService: logChannelMock }));
mock.module("@/features/images", () => imagesMock);
mock.module("@/features/puff", () => ({
  extractPuffContent: () => ({ kind: "text", text: "spam" }),
}));

// Re-mock after each test by importing fresh module via spy
import { handleModMention } from "@/features/ai-mod/handlers/mod-mention.handler";
import { SanctionCache } from "@/features/ai-mod/services/sanction-cache.service";
import { createMockMessage, createMockMember, createMockTextChannel } from "../../../mocks/discord";

const classifyMock = mock(async () => ({
  ok: true,
  entries: [{ index: 0, v: 1, c: 0.95, r: "spam", p: 0 }],
}));
mock.module("@/features/ai-mod/services/classifier.service", () => ({ classifyBatch: classifyMock }));

const imageDupMock = mock(async () => ({
  flagged: true,
  reason: "imagen spam cross-channel",
  matchedMessages: [],
}));
mock.module("@/features/ai-mod/services/image-duplicate.service", () => ({
  ImageDuplicateService: { checkImage: imageDupMock },
}));

beforeEach(() => {
  SanctionCache._resetForTests();
  casesMock.insert.mockClear();
  classifyMock.mockClear();
  imageDupMock.mockReset();
  imageDupMock.mockResolvedValue({ flagged: true, reason: "imagen spam cross-channel", matchedMessages: [] });
  casesMock.insert.mockImplementation(async () => 99);
  logChannelMock.getLogChannel.mockImplementation(async () => "log-1");
});

function setupReport() {
  const offender = createMockMessage({
    id: "offender-msg",
    author: { id: "spammer-1" },
    content: "buy crypto",
  });
  offender.member = createMockMember({ id: "spammer-1", moderatable: true });
  offender.isCommunicationDisabled = mock(() => false) as never;

  const report = createMockMessage({
    id: "report-1",
    content: "mod pls",
    attachments: [],
  });
  // The handler calls guild.members.fetch to resolve the offender; provide a
  // channel.messages.fetch returning only the offender.
  const ch = createMockTextChannel({
    id: "ch-1",
    messagesFetchResult: new Map([[offender.id, offender]]),
  });
  report.guild = {
    id: "g1",
    channels: { fetch: mock(async () => new Map([["log-1", { ...createMockTextChannel({ id: "log-1" }), send: mock(async () => ({})) }]])) },
    members: { fetch: mock(async (id: string) => createMockMember({ id, moderatable: true })) },
  } as never;
  report.channel = ch as never;
  report.reference = null;
  return { report, offender };
}

describe("handleModMention — cross-channel + dedup", () => {
  it("calls CasesService.insert once and bulk-deletes cross-channel matches", async () => {
    const matchedMsg = createMockMessage({ id: "cross-1", author: { id: "spammer-1" }, content: "dup" });
    matchedMsg.delete = mock(() => Promise.resolve()) as never;
    imageDupMock.mockResolvedValueOnce({
      flagged: true,
      reason: "imagen spam cross-channel",
      matchedMessages: [matchedMsg],
    });
    const { report } = setupReport();
    await handleModMention(report);
    expect(casesMock.insert).toHaveBeenCalledTimes(1);
    expect(matchedMsg.delete).toHaveBeenCalled();
  });

  it("does NOT call CasesService.insert on the second call within TTL (cache hit)", async () => {
    const { report } = setupReport();
    await handleModMention(report);
    expect(casesMock.insert).toHaveBeenCalledTimes(1);

    // Second call (cache hit). The classifier must still be called (handler is
    // stateless about the cache), but insert + alert should be skipped.
    casesMock.insert.mockClear();
    await handleModMention(report);
    expect(casesMock.insert).not.toHaveBeenCalled();
  });

  it("groups text + image for the same author into one case row", async () => {
    // Force classifier to flag 2 candidates in the same call
    classifyMock.mockResolvedValueOnce({
      ok: true,
      entries: [
        { index: 0, v: 1, c: 0.9, r: "spam", p: 0 },
        { index: 1, v: 1, c: 0.9, r: "spam2", p: 0 },
      ],
    });
    // Provide 2 messages as candidates (one text) — re-mock channel fetch
    const m1 = createMockMessage({ id: "a1", author: { id: "spammer-2" }, content: "x" });
    const m2 = createMockMessage({ id: "a2", author: { id: "spammer-2" }, content: "y" });
    m1.member = createMockMember({ id: "spammer-2", moderatable: true });
    m2.member = createMockMember({ id: "spammer-2", moderatable: true });
    m1.isCommunicationDisabled = mock(() => false) as never;
    m2.isCommunicationDisabled = mock(() => false) as never;
    const ch = createMockTextChannel({
      id: "ch-2",
      messagesFetchResult: new Map([[m1.id, m1], [m2.id, m2]]),
    });
    const report = createMockMessage({ id: "rep2", content: "mod" });
    report.guild = {
      id: "g1",
      channels: { fetch: mock(async () => new Map([["log-1", { ...createMockTextChannel({ id: "log-1" }), send: mock(async () => ({})) }]])) },
      members: { fetch: mock(async (id: string) => createMockMember({ id, moderatable: true })) },
    } as never;
    report.channel = ch as never;
    report.reference = null;

    // extractPuffContent returns text for both
    mock.module("@/features/puff", () => ({
      extractPuffContent: () => ({ kind: "text", text: "x" }),
    }));

    await handleModMention(report);
    expect(casesMock.insert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `bun test tests/unit/features/ai-mod/mod-mention-crosschannel.test.ts`
Expected: FAIL — the current handler has no `SanctionCache` import, the grouping logic doesn't exist, and `imageDupMock` mock is set up to return `{flagged:false, reason:""}` from the existing handler-level mock module so no cross-channel sweep runs.

- [ ] **Step 3: Refactor handleModMention**

Edit `src/features/ai-mod/handlers/mod-mention.handler.ts`.

3a. Update imports (line 18-19) — add `SanctionCache` and remove nothing. Replace:

```ts
import { ImageDuplicateService } from "../services/image-duplicate.service";
import { CasesService } from "../services/cases.service";
```

with:

```ts
import { ImageDuplicateService } from "../services/image-duplicate.service";
import { CasesService } from "../services/cases.service";
import { SanctionCache } from "../services/sanction-cache.service";
```

3b. Add a private `sweepCrossChannelMessages` helper at the end of the file. Place it after `persistScamImage`:

```ts
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

async function sweepCrossChannelMessages(
  guild: Guild,
  messages: Message[],
): Promise<void> {
  if (messages.length === 0) return;
  const seen = new Set<string>();
  const byChannel = new Map<string, Message[]>();
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const list = byChannel.get(m.channelId) ?? [];
    list.push(m);
    byChannel.set(m.channelId, list);
  }
  for (const [channelId, msgs] of byChannel) {
    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !("bulkDelete" in channel)) continue;
      const now = Date.now();
      const young = msgs.filter((m) => now - m.createdTimestamp < FOURTEEN_DAYS_MS);
      const old = msgs.filter((m) => now - m.createdTimestamp >= FOURTEEN_DAYS_MS);
      if (young.length > 0) {
        await (channel as unknown as { bulkDelete: (ids: string[]) => Promise<unknown> }).bulkDelete(
          young.map((m) => m.id),
        );
      }
      await Promise.all(old.map((m) => safeDelete(m)));
    } catch (e) {
      logger.warn(`ai-mod: cross-channel sweep failed for ${channelId}: ${e}`);
    }
  }
}
```

3c. Replace the "Act on each actionable candidate" loop (lines 152-190) with the grouping + cache-aware flow. The replacement is:

```ts
  // Group actionable candidates by author so the same user gets one alert + one
  // case row per call (and cross-channel matches are all swept together).
  const buckets = new Map<string, FlaggedCandidate[]>();
  for (const f of actionable) {
    const list = buckets.get(f.message.author.id) ?? [];
    list.push(f);
    buckets.set(f.message.author.id, list);
  }

  for (const [authorId, bucket] of buckets) {
    const primary = bucket[0];
    const crossChannel: Message[] = [];
    for (const f of bucket) {
      // Cross-channel matches are stored on the FlaggedCandidate by the
      // caller below; for now we re-fetch from the same source. The handler
      // already attaches the cross-channel messages onto `primary` via the
      // image-route; we aggregate all of them here.
      const r = f.fromImage
        ? await ImageDuplicateService.checkImage(message.guild, f.message)
        : null;
      if (r?.matchedMessages) crossChannel.push(...r.matchedMessages);
    }

    await sweepCrossChannelMessages(message.guild, crossChannel);

    let actionLabel = t.aiMod.action_timeout;
    try {
      const member = await message.guild.members.fetch(authorId).catch(() => null);
      if (member) {
        if (member.isCommunicationDisabled()) {
          actionLabel = t.aiMod.action_already_timeout;
        } else {
          const ok = await safeTimeout(member, ONE_DAY_MS, `ai-mod: ${primary.reason}`);
          if (!ok) actionLabel = t.aiMod.action_no_permission;
        }
      }
    } catch (e) {
      logger.warn(`ai-mod: timeout attempt failed: ${e}`);
      actionLabel = t.aiMod.action_no_permission;
    }

    const toDelete = new Set<string>([
      primary.message.id,
      ...bucket.map((f) => f.message.id),
    ]);
    for (const m of crossChannel) toDelete.add(m.id);
    for (const id of toDelete) {
      const msg = crossChannel.find((m) => m.id === id) ?? primary.message;
      await safeDelete(msg);
    }

    for (const f of bucket) {
      if (f.fromImage) await persistScamImage(guildId, f.message);
    }

    const cached = SanctionCache.get(guildId, authorId);
    if (cached) {
      continue;
    }

    const caseId = await CasesService.insert({
      guildId,
      authorId,
      channelId: primary.message.channelId,
      messageId: primary.message.id,
      content: primary.message.content || "(image)",
      verdict: primary.verdict,
      confidence: primary.confidence,
      platform: primary.platform,
      reason: primary.reason,
      actionTaken: actionLabel,
    });
    SanctionCache.set(guildId, authorId, caseId, primary.message.channelId);
    await sendFlaggedAlert(message, guildId, t, primary, actionLabel, caseId);
  }
```

NOTE: the in-loop re-fetch of `ImageDuplicateService.checkImage` is wasteful in production. To keep the test pattern simple and the public surface unchanged, we instead attach the `matchedMessages` onto each `FlaggedCandidate` in the routing step (line 119-135 of the original). Apply the smaller, more efficient fix instead — see Step 3d.

3d. **Cleaner approach**: attach `matchedMessages` to each `FlaggedCandidate` in the image routing block, then use that field in the action phase without re-fetching.

Replace the image-route block at lines 120-135 of the original file with:

```ts
    for (const imgMsg of imageCandidates) {
      const dup = await ImageDuplicateService.checkImage(message.guild, imgMsg);
      if (dup.flagged) {
        flagged.push({
          message: imgMsg,
          verdict: 1,
          confidence: 1,
          platform: 0,
          reason: dup.reason,
          fromImage: true,
          crossChannelMessages: dup.matchedMessages,
        });
      } else {
        precautionCandidates.push({ url: imgMsg.url, authorTag: imgMsg.author.tag });
      }
    }
```

Add a field to the `FlaggedCandidate` interface (line 32-39):

```ts
interface FlaggedCandidate {
  message: Message;
  verdict: 1 | 2;
  confidence: number;
  platform: number;
  reason: string;
  fromImage: boolean;
  crossChannelMessages?: Message[];
}
```

Now replace the action loop (lines 152-190) with the cleaner version below (no re-fetch). This is the version that goes into the final file:

```ts
  // Group actionable candidates by author so the same user gets one alert + one
  // case row per call (and cross-channel matches are all swept together).
  const buckets = new Map<string, FlaggedCandidate[]>();
  for (const f of actionable) {
    const list = buckets.get(f.message.author.id) ?? [];
    list.push(f);
    buckets.set(f.message.author.id, list);
  }

  for (const [authorId, bucket] of buckets) {
    const primary = bucket[0];
    const crossChannel: Message[] = [];
    for (const f of bucket) {
      if (f.crossChannelMessages) crossChannel.push(...f.crossChannelMessages);
    }

    await sweepCrossChannelMessages(message.guild, crossChannel);

    let actionLabel = t.aiMod.action_timeout;
    try {
      const member = await message.guild.members.fetch(authorId).catch(() => null);
      if (member) {
        if (member.isCommunicationDisabled()) {
          actionLabel = t.aiMod.action_already_timeout;
        } else {
          const ok = await safeTimeout(member, ONE_DAY_MS, `ai-mod: ${primary.reason}`);
          if (!ok) actionLabel = t.aiMod.action_no_permission;
        }
      }
    } catch (e) {
      logger.warn(`ai-mod: timeout attempt failed: ${e}`);
      actionLabel = t.aiMod.action_no_permission;
    }

    const toDeleteIds = new Set<string>([
      primary.message.id,
      ...bucket.map((f) => f.message.id),
      ...crossChannel.map((m) => m.id),
    ]);
    await Promise.all(
      [...toDeleteIds].map((id) => {
        const found = crossChannel.find((m) => m.id === id) ?? primary.message;
        return safeDelete(found);
      }),
    );

    for (const f of bucket) {
      if (f.fromImage) await persistScamImage(guildId, f.message);
    }

    const cached = SanctionCache.get(guildId, authorId);
    if (cached) continue;

    const caseId = await CasesService.insert({
      guildId,
      authorId,
      channelId: primary.message.channelId,
      messageId: primary.message.id,
      content: primary.message.content || "(image)",
      verdict: primary.verdict,
      confidence: primary.confidence,
      platform: primary.platform,
      reason: primary.reason,
      actionTaken: actionLabel,
    });
    SanctionCache.set(guildId, authorId, caseId, primary.message.channelId);
    await sendFlaggedAlert(message, guildId, t, primary, actionLabel, caseId);
  }
```

- [ ] **Step 4: Run the new test (expect pass)**

Run: `bun test tests/unit/features/ai-mod/mod-mention-crosschannel.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Run the full ai-mod test suite (expect pass)**

Run: `bun test tests/unit/features/ai-mod/`
Expected: all existing tests pass. The existing `mod-mention.handler.test.ts` continues to work because:
  - `imageDupMock` returns `{flagged:false, reason:""}` → no `crossChannelMessages` attached → sweep is a no-op.
  - `classifyMock` returns `{ok:false, entries:[]}` → no actionable → no bucket iteration.
  - Existing assertions about `casesMock.insert` not being called still hold.

If any existing test fails, it is because of an unrelated test setup issue — debug and fix before commit.

- [ ] **Step 6: Run the full test suite + lint**

Run: `bun test --isolate`
Run: `bunx tsc --noEmit` (or the project's lint command — check `package.json` scripts)
Expected: PASS. Fix anything that surfaced (likely none).

- [ ] **Step 7: Commit**

```bash
git add src/features/ai-mod/handlers/mod-mention.handler.ts \
        tests/unit/features/ai-mod/mod-mention-crosschannel.test.ts
git commit -m "feat(ai-mod): cross-channel sweep + sanction dedup in mod-mention"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - `SanctionCache` static class, 10-min TTL, lazy eviction, `_resetForTests` → Task 1 ✓
   - `ImageDuplicateResult.matchedMessages` + 100 cap → Task 2 ✓
   - `handleModMention` groups by author, consults cache, sweeps cross-channel → Task 3 ✓
   - One alert per author per call, idempotent timeout, edge cases → Task 3 ✓
   - Tests for cache, matchedMessages+cap, end-to-end grouping/dedup → Tasks 1, 2, 3 ✓
   - `index.ts` export → Task 1 Step 5 ✓

2. **Placeholder scan:** No "TODO", "TBD", "similar to", or vague steps. All code blocks complete. ✓

3. **Type consistency:**
   - `CachedSanction` defined Task 1, used Task 3 ✓
   - `ImageDuplicateResult.matchedMessages: Message[]` defined Task 2, used Task 3 (via `FlaggedCandidate.crossChannelMessages`) ✓
   - `SanctionCache.get` returns `CachedSanction | null`; Task 3 checks `if (cached) continue;` — null/undefined both falsy ✓
   - `SanctionCache.set(guildId, authorId, caseId, channelId)` signature matches Task 1 API ✓
   - `sweepCrossChannelMessages(guild, messages)` private helper signature consistent in Task 3 ✓

4. **Existing test compatibility:** the existing `mod-mention.handler.test.ts` mocks `imageDupMock` to return `{flagged:false, reason:""}` — Task 2 makes the return shape `{flagged, reason, matchedMessages: []}` for the un-flagged branch. The existing test does not destructure `matchedMessages`, so the test continues to pass without modification. ✓

5. **Backward compatibility of `image-duplicate.service.ts`:** the only consumer besides the new field is `mod-mention.handler.ts` (Task 3) which is updated atomically. No external callers. ✓
