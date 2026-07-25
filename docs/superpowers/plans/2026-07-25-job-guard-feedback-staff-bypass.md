# Job Guard — Staff Bypass + Feedback Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop job-guard/ai-mod from acting on `ManageMessages` authors, and add Correct/Incorrect feedback learning for job-guard with isolated `job_guard_*` tables.

**Architecture:** Mirror ai-mod’s cases + prompts + feedback-button pattern inside `job-guard`, with separate Drizzle tables so learned notes never enter ai-mod context. Staff bypass is a cheap permission check before classify. Classifier loads last 10 `job_guard_prompts` into the system prompt and tightens allow wording for portfolio/CV/GitHub.

**Tech Stack:** TypeScript, discord.js v14, Bun test (`bun test --isolate`), Drizzle ORM + drizzle-kit (SQLite/libsql), existing `AIClientService`.

**Spec:** `docs/superpowers/specs/2026-07-25-job-guard-feedback-staff-bypass-design.md`

## Global Constraints

- Runtime/tests: Bun. Run tests with `bun test --isolate <path>`.
- Path alias: `@/*` → `./src/*`.
- No new npm dependencies.
- Never write job-guard learning notes to `ai_mod_ai_prompts`.
- Never delete on AI/parse failure; delete only when `verdict === "block"` and `confidence >= 0.8`.
- Job-guard UI strings hardcoded Spanish (`ponytail:` comment ok).
- Feedback button permission: `ManageMessages` only (no mod_roles/notify coupling).
- `classify(content, guildId)` — guildId required so prompts can be loaded.
- Conventional commits, one commit per task (caveman-commit style, no AI trailers).
- Do not bump `package.json` version unless the user asks.

---

## File Structure

| File | Role |
|------|------|
| `src/db/schema/job-guard.ts` | **create** — `jobGuardCasesTable`, `jobGuardPromptsTable` |
| `src/db/schema/index.ts` | **modify** — re-export job-guard schema |
| `drizzle/0011_*.sql` | **generate** via `bun run db:generate` |
| `src/features/job-guard/services/cases.service.ts` | **create** |
| `src/features/job-guard/services/prompts.service.ts` | **create** |
| `src/features/job-guard/services/feedback.service.ts` | **create** |
| `src/features/job-guard/services/classifier.service.ts` | **modify** — guildId, prompts inject, stronger allow |
| `src/features/job-guard/handlers/enforce.handler.ts` | **modify** — ManageMessages skip, case+buttons |
| `src/features/job-guard/handlers/feedback-button.handler.ts` | **create** |
| `src/features/job-guard/index.ts` | **modify** — exports |
| `src/events/interaction-create.ts` | **modify** — `jobguard_` buttons |
| `src/features/ai-mod/handlers/mod-mention.handler.ts` | **modify** — skip ManageMessages candidates |
| `tests/mocks/discord.ts` | **modify** — optional `manageMessages` on mock messages |
| `tests/unit/features/job-guard/*.test.ts` | **create/modify** |
| `tests/unit/features/ai-mod/mod-mention.handler.test.ts` | **modify** if exists; else small new test |

---

### Task 1: Schema + migration

**Files:**
- Create: `src/db/schema/job-guard.ts`
- Modify: `src/db/schema/index.ts`
- Generate: `drizzle/0011_*.sql` (+ meta journal via drizzle-kit)

**Interfaces:**
- Consumes: drizzle sqlite helpers (same as `ai-mod.ts`).
- Produces: `jobGuardCasesTable`, `jobGuardPromptsTable` exported from `@/db/schema`.

- [ ] **Step 1: Create schema file**

Create `src/db/schema/job-guard.ts`:

```ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const jobGuardCasesTable = sqliteTable("job_guard_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  authorId: text("author_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  content: text("content").notNull(),
  verdict: text("verdict").notNull(), // "allow" | "block"
  confidence: real("confidence").notNull(),
  reason: text("reason"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  resolvedBy: text("resolved_by"),
  resolvedAction: text("resolved_action"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  feedbackAction: text("feedback_action"),
  promptPending: integer("prompt_pending", { mode: "boolean" }).notNull().default(false),
  promptError: text("prompt_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const jobGuardPromptsTable = sqliteTable("job_guard_prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  prompt: text("prompt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
```

- [ ] **Step 2: Export from schema barrel**

In `src/db/schema/index.ts`, add:

```ts
export * from "./job-guard";
```

- [ ] **Step 3: Generate migration**

Run: `bun run db:generate`

Expected: new file under `drizzle/` (e.g. `0011_*.sql`) creating `job_guard_cases` and `job_guard_prompts`. If generate needs env/credentials and fails in sandbox, write the SQL manually matching drizzle style (see `drizzle/0008_material_xavin.sql`) and update `drizzle/meta/_journal.json` the same way prior migrations did — prefer `db:generate` when possible.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/job-guard.ts src/db/schema/index.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(job-guard): add cases and prompts tables

EOF
)"
```

---

### Task 2: CasesService + PromptsService

**Files:**
- Create: `src/features/job-guard/services/cases.service.ts`
- Create: `src/features/job-guard/services/prompts.service.ts`
- Create: `tests/unit/features/job-guard/services.test.ts`

**Interfaces:**
- Consumes: `jobGuardCasesTable`, `jobGuardPromptsTable`, `db`.
- Produces:
  - `JobGuardCasesService.insert(payload): Promise<number>`
  - `JobGuardCasesService.get(id): Promise<CaseRow | null>`
  - `JobGuardCasesService.markResolved(id, by, action)`
  - `JobGuardCasesService.markFeedbackPending(id, by, action, error?)`
  - `JobGuardPromptsService.add(guildId, prompt)`
  - `JobGuardPromptsService.listRecent(guildId, limit): Promise<{ prompt: string }[]>`
  - `FeedbackAction = "correct" | "incorrect"`

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/features/job-guard/services.test.ts` mocking `@/db/connection`:

```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";

const insertResult = { lastInsertRowid: 42 };
const findFirst = mock(async () => null);
const updateSet = mock(async () => {});
const promptsFindMany = mock(async () => [] as { prompt: string }[]);

const insertValues = mock(async () => insertResult);
const updateWhere = mock(() => updateSet());

mock.module("@/db/connection", () => ({
  db: {
    insert: () => ({ values: insertValues }),
    update: () => ({ set: () => ({ where: updateWhere }) }),
    query: {
      jobGuardCasesTable: { findFirst },
      jobGuardPromptsTable: { findMany: promptsFindMany },
    },
  },
}));

import { JobGuardCasesService } from "@/features/job-guard/services/cases.service";
import { JobGuardPromptsService } from "@/features/job-guard/services/prompts.service";

describe("JobGuardCasesService", () => {
  beforeEach(() => {
    insertValues.mockClear();
    findFirst.mockClear();
  });

  it("insert returns lastInsertRowid as number", async () => {
    const id = await JobGuardCasesService.insert({
      guildId: "g1",
      authorId: "a1",
      channelId: "c1",
      messageId: "m1",
      content: "se busca",
      verdict: "block",
      confidence: 0.9,
      reason: "oferta",
      deleted: true,
    });
    expect(id).toBe(42);
    expect(insertValues).toHaveBeenCalled();
  });

  it("get returns null when missing", async () => {
    findFirst.mockImplementation(async () => null);
    expect(await JobGuardCasesService.get(99)).toBeNull();
  });
});

describe("JobGuardPromptsService", () => {
  it("listRecent returns prompt rows", async () => {
    promptsFindMany.mockImplementation(async () => [{ prompt: "nota" }]);
    const rows = await JobGuardPromptsService.listRecent("g1", 10);
    expect(rows).toEqual([{ prompt: "nota" }]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test --isolate tests/unit/features/job-guard/services.test.ts`  
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement CasesService**

Create `src/features/job-guard/services/cases.service.ts` modeled on ai-mod `CasesService`, but with job-guard fields (`verdict: string`, `deleted: boolean`, no platform/actionTaken):

```ts
import { db } from "@/db/connection";
import { jobGuardCasesTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export type FeedbackAction = "correct" | "incorrect";

export interface CaseInsertPayload {
  guildId: string;
  authorId: string;
  channelId: string;
  messageId: string;
  content: string;
  verdict: string;
  confidence: number;
  reason: string;
  deleted: boolean;
}

export interface CaseRow extends CaseInsertPayload {
  id: number;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAction: string | null;
  feedbackAction: string | null;
  promptPending: boolean;
  promptError: string | null;
}

export class JobGuardCasesService {
  static async insert(payload: CaseInsertPayload): Promise<number> {
    const result = (await db.insert(jobGuardCasesTable).values({
      ...payload,
      createdAt: new Date(),
    })) as unknown as { lastInsertRowid?: bigint | number };
    const id = result?.lastInsertRowid;
    if (typeof id === "bigint") return Number(id);
    if (typeof id === "number") return id;
    return 0;
  }

  static async get(id: number): Promise<CaseRow | null> {
    const row = await db.query.jobGuardCasesTable.findFirst({
      where: eq(jobGuardCasesTable.id, id),
    });
    return (row as unknown as CaseRow) ?? null;
  }

  static async markFeedbackPending(
    id: number,
    resolvedBy: string,
    feedbackAction: FeedbackAction,
    promptError?: string | null,
  ): Promise<void> {
    await db
      .update(jobGuardCasesTable)
      .set({
        feedbackAction,
        promptPending: true,
        promptError: promptError ?? "AI unavailable",
        resolvedBy,
      })
      .where(eq(jobGuardCasesTable.id, id));
  }

  static async markResolved(
    id: number,
    resolvedBy: string,
    resolvedAction: FeedbackAction,
  ): Promise<void> {
    await db
      .update(jobGuardCasesTable)
      .set({
        resolved: true,
        resolvedBy,
        resolvedAction,
        feedbackAction: resolvedAction,
        resolvedAt: new Date(),
        promptPending: false,
        promptError: null,
      })
      .where(eq(jobGuardCasesTable.id, id));
  }
}
```

- [ ] **Step 4: Implement PromptsService**

Create `src/features/job-guard/services/prompts.service.ts`:

```ts
import { db } from "@/db/connection";
import { jobGuardPromptsTable } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export class JobGuardPromptsService {
  static async add(guildId: string, prompt: string): Promise<void> {
    await db.insert(jobGuardPromptsTable).values({ guildId, prompt });
  }

  static async listRecent(
    guildId: string,
    limit: number,
  ): Promise<{ prompt: string }[]> {
    const rows = await db.query.jobGuardPromptsTable.findMany({
      where: eq(jobGuardPromptsTable.guildId, guildId),
      orderBy: [desc(jobGuardPromptsTable.createdAt)],
      limit,
    });
    return rows.map((r) => ({ prompt: r.prompt }));
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `bun test --isolate tests/unit/features/job-guard/services.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/job-guard/services/cases.service.ts \
  src/features/job-guard/services/prompts.service.ts \
  tests/unit/features/job-guard/services.test.ts
git commit -m "$(cat <<'EOF'
feat(job-guard): add cases and prompts services

EOF
)"
```

---

### Task 3: Staff bypass in enforceJobGuard

**Files:**
- Modify: `tests/mocks/discord.ts` — add `manageMessages?: boolean` to `MockMessageOptions`
- Modify: `tests/unit/features/job-guard/enforce.test.ts`
- Modify: `src/features/job-guard/handlers/enforce.handler.ts`

**Interfaces:**
- Consumes: `PermissionFlagsBits.ManageMessages` from discord.js.
- Produces: early return in `enforceJobGuard` when author has ManageMessages.

- [ ] **Step 1: Extend mock message options**

In `tests/mocks/discord.ts`, add to `MockMessageOptions`:

```ts
  manageMessages?: boolean;
```

In `createMockMessage`, pass permissions into `createMockMember`:

```ts
  const member = createMockMember({
    id: author.id,
    moderatable: opts.memberModeratable ?? true,
    permissions: {
      has: (perm: string | bigint) => {
        if (!opts.manageMessages) return false;
        const key = String(perm);
        return (
          key === "ManageMessages" ||
          key.includes("ManageMessages") ||
          // PermissionFlagsBits.ManageMessages numeric/bigint string forms
          key === "8192"
        );
      },
    },
  });
```

Prefer matching how other tests check permissions: `permissions.has("ManageMessages")` and/or `PermissionFlagsBits.ManageMessages`. Implement `has` to return true for both `ManageMessages` and `PermissionFlagsBits.ManageMessages` when `opts.manageMessages === true`.

- [ ] **Step 2: Write failing enforce test**

Add to `tests/unit/features/job-guard/enforce.test.ts`:

```ts
  it("skips authors with ManageMessages (no AI call)", async () => {
    setVerdict({ ok: true, verdict: "block", confidence: 0.95, reason: "aviso" });
    const msg = createMockMessage({
      channelId: "chan-1",
      content: "Por favor, no evitar conversaciones por aquí",
      manageMessages: true,
    });
    await enforceJobGuard(msg);
    expect(classifyMock).not.toHaveBeenCalled();
    expect(msg.delete).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `bun test --isolate tests/unit/features/job-guard/enforce.test.ts`  
Expected: FAIL — classify was called.

- [ ] **Step 4: Implement bypass**

At the top of `enforceJobGuard` (after feature/channel/guild checks, before content/classify), add:

```ts
import { PermissionFlagsBits, ... } from "discord.js";

  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `bun test --isolate tests/unit/features/job-guard/enforce.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/mocks/discord.ts \
  tests/unit/features/job-guard/enforce.test.ts \
  src/features/job-guard/handlers/enforce.handler.ts
git commit -m "$(cat <<'EOF'
fix(job-guard): skip ManageMessages authors

EOF
)"
```

---

### Task 4: Classifier — learned prompts + stronger allow

**Files:**
- Modify: `src/features/job-guard/services/classifier.service.ts`
- Create: `src/features/job-guard/services/feedback.service.ts` (needed later; can wait until Task 5 — **do not** create here unless needed)
- Modify: `tests/unit/features/job-guard/classifier.test.ts`

**Interfaces:**
- Consumes: `JobGuardPromptsService.listRecent(guildId, 10)`, `AIClientService.chat`.
- Produces: `classify(content: string, guildId: string): Promise<ClassifyResult>`  
  System prompt includes portfolio/CV/GitHub/LinkedIn as allow, and appends `Notas de moderadores:` when prompts exist.

- [ ] **Step 1: Rewrite classify tests to mock AIClientService + PromptsService**

Replace the fetch-based classify suite with:

```ts
const chatMock = mock(async () => null as string | null);
mock.module("@/features/ai-mod/services/ai-client.service", () => ({
  AIClientService: { chat: chatMock },
}));

const listRecentMock = mock(async () => [] as { prompt: string }[]);
mock.module("@/features/job-guard/services/prompts.service", () => ({
  JobGuardPromptsService: { listRecent: listRecentMock, add: mock(async () => {}) },
}));

// re-import classify AFTER mocks (or keep existing import order pattern used in enforce.test)

describe("classify with learning context", () => {
  beforeEach(() => {
    chatMock.mockClear();
    listRecentMock.mockClear();
    listRecentMock.mockImplementation(async () => []);
  });

  it("passes guild prompts into the system prompt", async () => {
    listRecentMock.mockImplementation(async () => [
      { prompt: "Portfolio con GitHub propio es allow" },
    ]);
    chatMock.mockImplementation(async () =>
      '{"verdict":"allow","confidence":0.9,"reason":"portfolio"}',
    );
    const r = await classify("mi github.com/yo", "g1");
    expect(r.ok).toBe(true);
    expect(listRecentMock).toHaveBeenCalledWith("g1", 10);
    const systemArg = chatMock.mock.calls[0]?.[0] as string;
    expect(systemArg).toContain("Notas de moderadores:");
    expect(systemArg).toContain("Portfolio con GitHub propio es allow");
    expect(systemArg).toMatch(/portfolio|GitHub|LinkedIn/i);
  });

  it("works with empty prompt list", async () => {
    chatMock.mockImplementation(async () =>
      '{"verdict":"block","confidence":0.95,"reason":"oferta"}',
    );
    const r = await classify("se busca dev", "g1");
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe("block");
  });
});
```

Keep existing `parseVerdict` tests unchanged. Update any remaining `classify("...")` calls to `classify("...", "g1")`.

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test --isolate tests/unit/features/job-guard/classifier.test.ts`  
Expected: FAIL (signature / missing notes section).

- [ ] **Step 3: Implement classifier changes**

Update `SYSTEM_PROMPT` allow section to explicitly list own portfolio, CV, GitHub, LinkedIn, personal site.

Change signature and body:

```ts
const MAX_PROMPTS = 10;

export async function classify(
  content: string,
  guildId: string,
): Promise<ClassifyResult> {
  if (!env.JOB_CHANNEL_ID || !env.AI_API_URL || !env.AI_API_KEY) return { ok: false };

  const notes = await JobGuardPromptsService.listRecent(guildId, MAX_PROMPTS);
  const notesBlock =
    notes.length === 0
      ? ""
      : `\n\nNotas de moderadores:\n${notes.map((n) => `- ${n.prompt}`).join("\n")}`;

  const raw = await AIClientService.chat(
    SYSTEM_PROMPT + notesBlock,
    `<mensaje>\n${content}\n</mensaje>`,
  );
  if (raw === null) return { ok: false };
  return parseVerdict(raw);
}
```

- [ ] **Step 4: Update enforce call site**

In `enforce.handler.ts`:

```ts
  const result = await classify(content.slice(0, MAX_INPUT), message.guild.id);
```

- [ ] **Step 5: Run classifier + enforce tests — expect PASS**

Run:
`bun test --isolate tests/unit/features/job-guard/classifier.test.ts tests/unit/features/job-guard/enforce.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/job-guard/services/classifier.service.ts \
  src/features/job-guard/handlers/enforce.handler.ts \
  tests/unit/features/job-guard/classifier.test.ts
git commit -m "$(cat <<'EOF'
feat(job-guard): inject learned prompts in classifier

EOF
)"
```

---

### Task 5: Case insert + feedback buttons on alert

**Files:**
- Modify: `src/features/job-guard/handlers/enforce.handler.ts`
- Modify: `tests/unit/features/job-guard/enforce.test.ts`

**Interfaces:**
- Consumes: `JobGuardCasesService.insert`, discord.js `ButtonBuilder` / `ActionRowBuilder`.
- Produces: alert message with `components` customIds `jobguard_<id>_correct` and `jobguard_<id>_incorrect`. Case inserted **before** `logChannel.send`.

- [ ] **Step 1: Extend enforce mocks + failing test**

In `enforce.test.ts`, mock cases service and capture log send:

```ts
const insertCaseMock = mock(async () => 7);
mock.module("@/features/job-guard/services/cases.service", () => ({
  JobGuardCasesService: { insert: insertCaseMock },
}));

// Change LogChannelService mock to return a channel id and make guild.channels.fetch return a text channel with send mock.
```

Use a richer mock: when testing alert path, set `getLogChannel` → `"log-1"`, and `message.guild.channels.fetch` → `{ type: ChannelType.GuildText, send: sendMock }`.

Add test:

```ts
  it("inserts a case and attaches feedback buttons on block", async () => {
    setVerdict({ ok: true, verdict: "block", confidence: 0.9, reason: "oferta" });
    // ... wire log channel + sendMock ...
    const msg = createMockMessage({ channelId: "chan-1", content: "se busca dev" });
    await enforceJobGuard(msg);
    expect(insertCaseMock).toHaveBeenCalled();
    const sent = sendMock.mock.calls[0]?.[0] as {
      components?: { components?: { data?: { custom_id?: string } }[] }[];
    };
    // Assert customIds include jobguard_7_correct and jobguard_7_incorrect
    // (inspect ActionRowBuilder structure from the actual send payload — use
    //  sendMock.mock.calls[0][0].components and check ButtonBuilder data,
    //  or spy JSON: components[0].components.map(c => c.data.custom_id))
  });
```

If asserting ButtonBuilder internals is awkward, assert `send` was called with an object whose `components` length is 1 and stringify/`JSON.stringify` of the payload includes `jobguard_7_correct`.

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test --isolate tests/unit/features/job-guard/enforce.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement notifyMods with case + buttons**

Update flow in `enforceJobGuard`:

```ts
  const shouldDelete = (result.confidence ?? 0) >= BLOCK_THRESHOLD;
  const deleted = shouldDelete ? await safeDelete(message) : false;

  const caseId = await JobGuardCasesService.insert({
    guildId: message.guild.id,
    authorId: message.author.id,
    channelId: message.channelId,
    messageId: message.id,
    content: content.slice(0, MAX_INPUT),
    verdict: "block",
    confidence: result.confidence ?? 0,
    reason: result.reason ?? "",
    deleted,
  });

  await notifyMods(message, content, result, deleted, caseId);
```

In `notifyMods`, build buttons (Spanish labels):

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
} from "discord.js";

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`jobguard_${caseId}_correct`)
      .setLabel("Correcto")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`jobguard_${caseId}_incorrect`)
      .setLabel("Incorrecto")
      .setStyle(ButtonStyle.Danger),
  );

  await logChannel.send({
    embeds: [embed.setFooter({ text: `case_id: ${caseId}` })],
    components: [row],
  });
```

Keep existing embed fields. Wrap insert+notify so insert failure logs warn but still attempts notify without buttons only if insert returns 0 — prefer always requiring a real id; if insert returns 0, send embed without buttons and `logger.warn`.

- [ ] **Step 4: Run enforce tests — PASS**

Run: `bun test --isolate tests/unit/features/job-guard/enforce.test.ts`  
Expected: PASS (including older tests that don’t care about insert — mock insert still ok).

- [ ] **Step 5: Commit**

```bash
git add src/features/job-guard/handlers/enforce.handler.ts \
  tests/unit/features/job-guard/enforce.test.ts
git commit -m "$(cat <<'EOF'
feat(job-guard): store cases and feedback buttons

EOF
)"
```

---

### Task 6: FeedbackService + feedback button handler

**Files:**
- Create: `src/features/job-guard/services/feedback.service.ts`
- Create: `src/features/job-guard/handlers/feedback-button.handler.ts`
- Create: `tests/unit/features/job-guard/feedback-button.handler.test.ts`
- Modify: `src/features/job-guard/index.ts`
- Modify: `src/events/interaction-create.ts`

**Interfaces:**
- Consumes: `AIClientService`, `JobGuardCasesService`, `JobGuardPromptsService`, `PermissionFlagsBits.ManageMessages`.
- Produces: `handleJobGuardFeedbackButton(interaction: ButtonInteraction): Promise<void>`  
  customId: `jobguard_<caseId>_correct|incorrect`.

- [ ] **Step 1: Implement FeedbackService**

Create `src/features/job-guard/services/feedback.service.ts` (mirror ai-mod, Spanish notes, allow/block vocabulary):

```ts
import { AIClientService } from "@/features/ai-mod/services/ai-client.service";

const FP_SYSTEM = `Un moderador marcó como INCORRECTA tu clasificación de este mensaje del canal busca-trabajo.
Genera UNA nota breve (1-2 frases) para evitar el mismo error. No repitas el mensaje; describe el patrón.
Responde en español. SOLO la nota, sin JSON ni markdown.`;

const TP_SYSTEM = `Un moderador confirmó que tu clasificación de este mensaje del canal busca-trabajo fue CORRECTA.
Genera UNA nota breve (1-2 frases) que describa el patrón. No repitas el mensaje.
Responde en español. SOLO la nota, sin JSON ni markdown.`;

function buildUser(content: string, verdict: string, c: number, r: string): string {
  return [
    `Mensaje clasificado: ${content}`,
    `Veredicto dado: ${verdict} (allow|block)`,
    `Confidence dado: ${c}`,
    `Razón dada: ${r}`,
  ].join("\n");
}

export class JobGuardFeedbackService {
  static async generateAntiFpPrompt(
    content: string,
    verdict: string,
    c: number,
    r: string,
  ): Promise<string | null> {
    const raw = await AIClientService.chat(FP_SYSTEM, buildUser(content, verdict, c, r));
    const note = raw?.trim() ?? "";
    return note.length > 0 ? note : null;
  }

  static async generateTruePositivePrompt(
    content: string,
    verdict: string,
    c: number,
    r: string,
  ): Promise<string | null> {
    const raw = await AIClientService.chat(TP_SYSTEM, buildUser(content, verdict, c, r));
    const note = raw?.trim() ?? "";
    return note.length > 0 ? note : null;
  }
}
```

- [ ] **Step 2: Write failing feedback-button tests**

Create `tests/unit/features/job-guard/feedback-button.handler.test.ts` patterned after `tests/unit/features/ai-mod/feedback-button.handler.test.ts`:

- Mock `JobGuardCasesService`, `JobGuardPromptsService`, `JobGuardFeedbackService`.
- Interaction with `ManageMessages` + `jobguard_7_correct` → `generateTruePositivePrompt`, `prompts.add`, `markResolved`, buttons cleared.
- `jobguard_7_incorrect` → anti-FP path.
- Without ManageMessages → ephemeral no-permission, no resolve.
- AI returns null → `markFeedbackPending`, buttons not disabled.

- [ ] **Step 3: Run — expect FAIL**

Run: `bun test --isolate tests/unit/features/job-guard/feedback-button.handler.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Implement handler**

Create `src/features/job-guard/handlers/feedback-button.handler.ts`:

```ts
export async function handleJobGuardFeedbackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  // 1. Parse jobguard_<id>_correct|incorrect
  // 2. Require ManageMessages on clicker
  // 3. Ephemeral ack (Spanish)
  // 4. Load case; if missing/resolved → editReply and return
  // 5. Generate note (TP/anti-FP)
  // 6. Success: PromptsService.add + markResolved + edit alert (components: [])
  // 7. Failure: markFeedbackPending; keep buttons
}
```

Spanish ephemeral strings hardcoded (ponytail). Disable buttons by editing `interaction.message` like ai-mod `disableButtonsAndNote` (no timeout removal).

- [ ] **Step 5: Wire barrel + interaction-create**

`src/features/job-guard/index.ts`:

```ts
export { enforceJobGuard } from "./handlers/enforce.handler";
export { handleJobGuardFeedbackButton } from "./handlers/feedback-button.handler";
export { classify, parseVerdict } from "./services/classifier.service";
export type { ClassifyResult, Verdict } from "./services/classifier.service";
```

In `src/events/interaction-create.ts`:

```ts
import { handleJobGuardFeedbackButton } from "@/features/job-guard";

// inside isButton():
      if (interaction.customId.startsWith("jobguard_")) {
        await handleJobGuardFeedbackButton(interaction);
        return;
      }
```

- [ ] **Step 6: Run feedback + job-guard suite — PASS**

Run: `bun test --isolate tests/unit/features/job-guard/`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/job-guard/ \
  src/events/interaction-create.ts \
  tests/unit/features/job-guard/feedback-button.handler.test.ts
git commit -m "$(cat <<'EOF'
feat(job-guard): add feedback buttons and learning

EOF
)"
```

---

### Task 7: ai-mod — skip ManageMessages candidates

**Files:**
- Modify: `src/features/ai-mod/handlers/mod-mention.handler.ts` (`resolveCandidates`)
- Modify or create: test under `tests/unit/features/ai-mod/` covering candidate skip

**Interfaces:**
- Consumes: `PermissionFlagsBits.ManageMessages` on candidate `m.member`.
- Produces: candidates without ManageMessages authors. Reporter early-return unchanged.

- [ ] **Step 1: Find existing mod-mention tests**

If `tests/unit/features/ai-mod/mod-mention.handler.test.ts` exists, add a case. Else create a focused unit test that imports a small exported helper — **prefer** filtering inside `resolveCandidates` and testing via exporting nothing: duplicate the filter check in a tiny pure helper only if testing is otherwise impossible.

Simplest approach: in `resolveCandidates`, after bot/reporter filters:

```ts
      if (m.member?.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
```

For reply branch, after fetch:

```ts
      if (ref.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return [];
      return [ref];
```

- [ ] **Step 2: Write failing test**

Create `tests/unit/features/ai-mod/resolve-candidates-staff.test.ts` **only if** you export `resolveCandidates` for tests — **do not** export solely for tests.

Preferred: add an integration-style test in existing `mod-mention.handler.test.ts` that mocks channel fetch returning a ManageMessages author message and asserts no `classifyBatch` / no delete. Read existing test file structure first and follow it.

If no good hook exists, add a 5-line comment in plan execution: implement filter + a minimal test that mocks `handleModMention` dependencies and feeds a reply reference whose member has ManageMessages — expect classify not called.

- [ ] **Step 3: Implement filter in resolveCandidates**

As shown in Step 1.

- [ ] **Step 4: Run ai-mod related tests — PASS**

Run: `bun test --isolate tests/unit/features/ai-mod/`  
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-mod/handlers/mod-mention.handler.ts \
  tests/unit/features/ai-mod/
git commit -m "$(cat <<'EOF'
fix(ai-mod): skip ManageMessages message authors

EOF
)"
```

---

### Task 8: Full regression + smoke

**Files:** none new

- [ ] **Step 1: Run full unit suite**

Run: `bun test --isolate`  
Expected: PASS.

- [ ] **Step 2: Manual smoke checklist (for human)**

1. Mod with ManageMessages posts rule reminder in job channel → not deleted.
2. Normal user posts job offer → deleted (if confident) + alert with Correcto/Incorrecto.
3. Click Incorrecto on a false positive → prompt saved; next similar autopromo/portfolio less likely to block.
4. Click Correcto → reinforcement note saved.
5. `m!` ai-mod report flow still skips staff-authored candidates.

- [ ] **Step 3: Final commit only if Step 1 left dirty files; else skip**

If any leftover formatting/docs: commit as `chore(job-guard): tidy after feedback work`.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| job-guard ManageMessages author bypass | Task 3 |
| ai-mod skip ManageMessages candidates | Task 7 |
| monitorImages unchanged | (no task) |
| `job_guard_cases` + `job_guard_prompts` | Task 1–2 |
| Feedback buttons Correct/Incorrect | Task 5–6 |
| Learning prompts injected into classifier | Task 4 |
| Stronger portfolio/allow wording | Task 4 |
| No shared prompts table / no ai_mod_ai_prompts writes | Tasks 1–6 |
| Case before alert send | Task 5 |
| prompt_pending on AI failure | Task 6 |
| Spanish hardcoded UI | Tasks 5–6 |
| Tests listed in spec | Tasks 3–7 |

## Placeholder / consistency notes

- Service class names: `JobGuardCasesService`, `JobGuardPromptsService`, `JobGuardFeedbackService` (avoid colliding with ai-mod `CasesService` / `FeedbackService` if both imported).
- customId prefix: `jobguard_` (matches interaction-create gate).
- `classify(content, guildId)` — all call sites updated in Task 4.
- `MAX_PROMPTS = 10` for job-guard (spec), not ai-mod’s 50.
