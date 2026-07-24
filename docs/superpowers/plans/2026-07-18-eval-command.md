# Eval Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-only `m!eval` command that executes raw JS in the bot process for live debugging, gated by a single hardcoded Discord user ID, with secret redaction and multi-message output splitting.

**Architecture:** New feature module `src/features/eval/` with one handler file exposing `handleEvalCommand` plus small pure helper functions (code extraction, secret redaction, output chunking, code-block wrapping) that are independently unit-tested. Registered in the existing prefix-command registry like every other feature. No new dependencies — uses `node:util.inspect` and indirect `eval`.

**Tech Stack:** TypeScript, discord.js v14, Bun test runner (existing conventions — no new libraries).

## Global Constraints

- `OWNER_ID = "398321973404368927"` hardcoded as a literal constant in the handler file — not read from env/DB/config (from spec, confirmed in brainstorming).
- Non-owner invocations: return immediately, no reply, no reaction, no error message (silent).
- No audit logging of eval usage — explicitly out of scope per user.
- No sandboxing (vm/worker isolation) — full process access is the accepted trade-off (spec: "Residual risk (accepted)").
- No rate limiting, no confirmation prompts.
- Output redaction: any substring of the formatted output matching a current `process.env` value must become `[REDACTED]` before sending.
- Long output: split into multiple sequential Discord messages (each under Discord's 2000-char limit), never truncate/drop content.
- Original command message is deleted after execution (success or error), via the existing `safeDelete` helper.
- `m!eval` is NOT added to `src/commands/help/catalog.ts` — it must not appear in `m!help`.
- Confirmed: the owner already has `ManageMessages` on the target guild, so the existing `hasPermission()` gate in `src/events/message-create.ts` (which runs before any `command.execute`) requires no changes.
- Spec doc: `docs/superpowers/specs/2026-07-18-eval-command-design.md`.

---

## File Structure

- **Modify:** `tests/mocks/discord.ts` — `createMockMessage` currently has no `channel` property; add a minimal `channel: { send: mock(...) }` so tests can assert on multi-message splitting (real `discord.js` `Message.channel` always has `.send`).
- **Create:** `src/features/eval/handlers/eval.handler.ts` — all logic: owner gate, code extraction from raw message content (NOT the whitespace-collapsed `args` array — command dispatch in `message-create.ts:32-35` does `.split(/\s+/)`, which would mangle multi-line eval code), indirect `eval`, redaction, chunking, sending, cleanup. Exports `handleEvalCommand` plus the pure helpers (`extractCode`, `redactSecrets`, `chunkForDiscord`, `wrapCodeBlock`) for direct unit testing.
- **Create:** `src/features/eval/index.ts` — barrel, `export { handleEvalCommand } from "./handlers/eval.handler"`.
- **Modify:** `src/commands/registry.ts` — import `handleEvalCommand` from `@/features/eval`, add `{ name: "eval", aliases: ["ev"], execute: handleEvalCommand }` to the `commands` array.
- **Create:** `tests/unit/features/eval/handler.test.ts` — unit tests for helpers + integration tests for `handleEvalCommand` (follows the `tests/unit/features/job-guard/` convention, the most recently established pattern in this codebase).

## Interfaces

- `extractCode(content: string, prefix: string): string` — strips prefix + command token, then strips a wrapping ` ```lang\n...\n``` ` fence if present, returns trimmed code.
- `redactSecrets(text: string): string` — replaces every occurrence of any non-trivial `process.env` value with `[REDACTED]`.
- `chunkForDiscord(text: string, size?: number): string[]` — splits text into chunks of at most `size` (default 1900) chars; returns `[text]` unchanged if already short enough.
- `wrapCodeBlock(text: string): string` — wraps in ` ```js\n...\n``` `.
- `handleEvalCommand(message: Message, args: string[], prefix: string): Promise<void>` — matches the `Command["execute"]` signature in `src/commands/registry.ts:15`, so it plugs into the registry with zero adapter code.

---

### Task 1: Extend the Discord mock with `channel.send`

**Files:**
- Modify: `tests/mocks/discord.ts`

**Interfaces:**
- Produces: `createMockMessage(...)` return value now has a `channel: { send: Mock }` property, where `channel.send` is a `bun:test` `mock(() => Promise.resolve({} as unknown as Message))`. No other feature's tests are affected since this only adds a property that didn't exist before (`message.channel` was previously `undefined` — nothing accessed it, since `grep` confirms no existing test reads `message.channel`).

- [ ] **Step 1: Read the current `createMockMessage` implementation**

Already read (`tests/mocks/discord.ts:133-192`) — the `message` object literal ends with:
```ts
    delete: mock(() => Promise.resolve()),
    reply: mock(() => Promise.resolve(replyTarget as unknown as Message)),
    react: mock(() => Promise.resolve()),
  } as unknown as Message;
```

- [ ] **Step 2: Add the `channel` property**

Edit `tests/mocks/discord.ts`, inserting a `channel` field into the `message` object literal (right after `react`):
```ts
    delete: mock(() => Promise.resolve()),
    reply: mock(() => Promise.resolve(replyTarget as unknown as Message)),
    react: mock(() => Promise.resolve()),
    channel: {
      send: mock(() => Promise.resolve({} as unknown as Message)),
    },
  } as unknown as Message;
```

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

Run: `bun test --isolate`
Expected: same pass count as before this change (no new tests yet) — this step only verifies the mock addition is non-breaking.

- [ ] **Step 4: Commit**

```bash
git add tests/mocks/discord.ts
git commit -m "test(mocks): add channel.send to createMockMessage for eval command tests"
```

---

### Task 2: `extractCode` helper (TDD)

**Files:**
- Create: `src/features/eval/handlers/eval.handler.ts`
- Test: `tests/unit/features/eval/handler.test.ts`

**Interfaces:**
- Produces: `extractCode(content: string, prefix: string): string`

- [ ] **Step 1: Create the test file with failing tests for `extractCode`**

```ts
import { describe, it, expect } from "bun:test";
import { extractCode } from "@/features/eval/handlers/eval.handler";

describe("extractCode", () => {
  it("strips prefix and command token from a plain expression", () => {
    expect(extractCode("m!eval 1 + 1", "m!")).toBe("1 + 1");
  });

  it("strips prefix and alias token", () => {
    expect(extractCode("m!ev 1 + 1", "m!")).toBe("1 + 1");
  });

  it("strips a fenced code block with language tag", () => {
    const content = "m!eval ```js\nconsole.log(1)\n```";
    expect(extractCode(content, "m!")).toBe("console.log(1)");
  });

  it("strips a fenced code block without language tag", () => {
    const content = "m!eval ```\nconsole.log(1)\n```";
    expect(extractCode(content, "m!")).toBe("console.log(1)");
  });

  it("preserves internal newlines in multi-line code", () => {
    const content = "m!eval ```js\nconst a = 1;\nconst b = 2;\nreturn a + b;\n```";
    expect(extractCode(content, "m!")).toBe(
      "const a = 1;\nconst b = 2;\nreturn a + b;",
    );
  });

  it("trims surrounding whitespace when there is no fence", () => {
    expect(extractCode("m!eval   1 + 1  ", "m!")).toBe("1 + 1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: FAIL — `Cannot find module '@/features/eval/handlers/eval.handler'` (file doesn't exist yet).

- [ ] **Step 3: Create the handler file with `extractCode`**

```ts
export function extractCode(content: string, prefix: string): string {
  const withoutPrefix = content.slice(prefix.length);
  const withoutCommand = withoutPrefix.replace(/^\S+\s*/, "");
  const fenced = withoutCommand.match(/^```(?:\w+)?\n?([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : withoutCommand).trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: PASS — all 6 `extractCode` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/eval/handlers/eval.handler.ts tests/unit/features/eval/handler.test.ts
git commit -m "feat(eval): add extractCode helper"
```

---

### Task 3: `redactSecrets` helper (TDD)

**Files:**
- Modify: `src/features/eval/handlers/eval.handler.ts`
- Modify: `tests/unit/features/eval/handler.test.ts`

**Interfaces:**
- Consumes: none (reads `process.env` directly).
- Produces: `redactSecrets(text: string): string`

- [ ] **Step 1: Add failing tests for `redactSecrets`**

Append to `tests/unit/features/eval/handler.test.ts`:
```ts
import { redactSecrets } from "@/features/eval/handlers/eval.handler";

describe("redactSecrets", () => {
  it("replaces a known env value with [REDACTED]", () => {
    process.env.EVAL_TEST_SECRET = "super-secret-value-123";
    const out = redactSecrets("token is super-secret-value-123 in output");
    expect(out).toBe("token is [REDACTED] in output");
    delete process.env.EVAL_TEST_SECRET;
  });

  it("redacts every occurrence, not just the first", () => {
    process.env.EVAL_TEST_SECRET = "abcdefghij";
    const out = redactSecrets("abcdefghij and again abcdefghij");
    expect(out).toBe("[REDACTED] and again [REDACTED]");
    delete process.env.EVAL_TEST_SECRET;
  });

  it("ignores short/trivial env values to avoid over-redacting", () => {
    process.env.EVAL_TEST_SHORT = "ok";
    const out = redactSecrets("the word ok appears here");
    expect(out).toBe("the word ok appears here");
    delete process.env.EVAL_TEST_SHORT;
  });

  it("leaves text unchanged when nothing matches", () => {
    expect(redactSecrets("nothing sensitive here")).toBe(
      "nothing sensitive here",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: FAIL — `redactSecrets` is not exported.

- [ ] **Step 3: Implement `redactSecrets`**

Add to `src/features/eval/handlers/eval.handler.ts`:
```ts
const MIN_REDACTABLE_LENGTH = 6;

export function redactSecrets(text: string): string {
  let result = text;
  for (const value of Object.values(process.env)) {
    if (!value || value.length < MIN_REDACTABLE_LENGTH) continue;
    result = result.split(value).join("[REDACTED]");
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: PASS — all `redactSecrets` tests green, `extractCode` tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/features/eval/handlers/eval.handler.ts tests/unit/features/eval/handler.test.ts
git commit -m "feat(eval): add redactSecrets helper"
```

---

### Task 4: `chunkForDiscord` + `wrapCodeBlock` helpers (TDD)

**Files:**
- Modify: `src/features/eval/handlers/eval.handler.ts`
- Modify: `tests/unit/features/eval/handler.test.ts`

**Interfaces:**
- Produces: `chunkForDiscord(text: string, size?: number): string[]`, `wrapCodeBlock(text: string): string`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/features/eval/handler.test.ts`:
```ts
import { chunkForDiscord, wrapCodeBlock } from "@/features/eval/handlers/eval.handler";

describe("chunkForDiscord", () => {
  it("returns a single chunk when text fits", () => {
    expect(chunkForDiscord("short text")).toEqual(["short text"]);
  });

  it("splits into multiple chunks respecting the size limit", () => {
    const text = "a".repeat(25);
    const chunks = chunkForDiscord(text, 10);
    expect(chunks).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(5)]);
  });

  it("reproduces the original text when chunks are concatenated", () => {
    const text = "x".repeat(4321);
    const chunks = chunkForDiscord(text, 1900);
    expect(chunks.join("")).toBe(text);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1900);
  });
});

describe("wrapCodeBlock", () => {
  it("wraps text in a js fenced code block", () => {
    expect(wrapCodeBlock("1 + 1")).toBe("```js\n1 + 1\n```");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: FAIL — `chunkForDiscord`/`wrapCodeBlock` not exported.

- [ ] **Step 3: Implement both helpers**

Add to `src/features/eval/handlers/eval.handler.ts`:
```ts
const DEFAULT_CHUNK_SIZE = 1900;

export function chunkForDiscord(
  text: string,
  size = DEFAULT_CHUNK_SIZE,
): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export function wrapCodeBlock(text: string): string {
  return "```js\n" + text + "\n```";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: PASS — all helper tests green (extractCode, redactSecrets, chunkForDiscord, wrapCodeBlock).

- [ ] **Step 5: Commit**

```bash
git add src/features/eval/handlers/eval.handler.ts tests/unit/features/eval/handler.test.ts
git commit -m "feat(eval): add chunkForDiscord and wrapCodeBlock helpers"
```

---

### Task 5: `handleEvalCommand` — owner gate, execution, output, cleanup (TDD)

**Files:**
- Modify: `src/features/eval/handlers/eval.handler.ts`
- Modify: `tests/unit/features/eval/handler.test.ts`

**Interfaces:**
- Consumes: `extractCode`, `redactSecrets`, `chunkForDiscord`, `wrapCodeBlock` (Tasks 2-4), `safeDelete` from `@/core/discord/moderation` (existing, `src/core/discord/moderation.ts:4`), `createMockMessage` from `tests/mocks/discord.ts` (Task 1, now includes `channel.send`).
- Produces: `handleEvalCommand(message: Message, args: string[], prefix: string): Promise<void>` — signature matches `Command["execute"]` in `src/commands/registry.ts:15`.

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/features/eval/handler.test.ts`:
```ts
import { handleEvalCommand } from "@/features/eval/handlers/eval.handler";
import { createMockMessage } from "../../../mocks/discord";

const OWNER_ID = "398321973404368927";

describe("handleEvalCommand", () => {
  it("does nothing for a non-owner author", async () => {
    const msg = createMockMessage({
      author: { id: "999999999999999999" },
      content: "m!eval 1 + 1",
    });
    await handleEvalCommand(msg, ["1", "+", "1"], "m!");
    expect(msg.reply).not.toHaveBeenCalled();
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it("evaluates a sync expression and replies with the result", async () => {
    const msg = createMockMessage({
      author: { id: OWNER_ID },
      content: "m!eval 1 + 1",
    });
    await handleEvalCommand(msg, ["1", "+", "1"], "m!");
    expect(msg.reply).toHaveBeenCalledTimes(1);
    const replyArg = (msg.reply as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(replyArg).toContain("2");
  });

  it("supports await in the evaluated code", async () => {
    const msg = createMockMessage({
      author: { id: OWNER_ID },
      content: 'm!eval await Promise.resolve("done")',
    });
    await handleEvalCommand(msg, [], "m!");
    const replyArg = (msg.reply as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(replyArg).toContain("done");
  });

  it("replies with the error instead of throwing when code throws", async () => {
    const msg = createMockMessage({
      author: { id: OWNER_ID },
      content: 'm!eval throw new Error("boom")',
    });
    await handleEvalCommand(msg, [], "m!");
    expect(msg.reply).toHaveBeenCalledTimes(1);
    const replyArg = (msg.reply as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(replyArg).toContain("boom");
  });

  it("redacts a matching env value from the reply", async () => {
    process.env.EVAL_TEST_SECRET = "leaked-secret-value";
    const msg = createMockMessage({
      author: { id: OWNER_ID },
      content: "m!eval process.env.EVAL_TEST_SECRET",
    });
    await handleEvalCommand(msg, [], "m!");
    const replyArg = (msg.reply as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(replyArg).not.toContain("leaked-secret-value");
    expect(replyArg).toContain("[REDACTED]");
    delete process.env.EVAL_TEST_SECRET;
  });

  it("splits long output across multiple messages via channel.send", async () => {
    const msg = createMockMessage({
      author: { id: OWNER_ID },
      content: 'm!eval "x".repeat(5000)',
    });
    await handleEvalCommand(msg, [], "m!");
    expect(msg.reply).toHaveBeenCalledTimes(1);
    expect(msg.channel.send).toHaveBeenCalled();
    const sendCalls = (msg.channel.send as ReturnType<typeof mock>).mock.calls;
    for (const call of sendCalls) {
      expect((call[0] as string).length).toBeLessThanOrEqual(1920);
    }
  });

  it("deletes the original message after execution", async () => {
    const msg = createMockMessage({
      author: { id: OWNER_ID },
      content: "m!eval 1 + 1",
    });
    await handleEvalCommand(msg, ["1", "+", "1"], "m!");
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });

  it("still deletes the original message when the code throws", async () => {
    const msg = createMockMessage({
      author: { id: OWNER_ID },
      content: 'm!eval throw new Error("boom")',
    });
    await handleEvalCommand(msg, [], "m!");
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });
});
```

Note: import `mock` from `"bun:test"` at the top of the file alongside `describe, it, expect` (already needed for the `ReturnType<typeof mock>` casts above).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: FAIL — `handleEvalCommand` not exported.

- [ ] **Step 3: Implement `handleEvalCommand`**

Add to `src/features/eval/handlers/eval.handler.ts` (imports go at the top of the file):
```ts
import type { Message } from "discord.js";
import { inspect } from "node:util";
import { safeDelete } from "@/core/discord/moderation";

const OWNER_ID = "398321973404368927";

export async function handleEvalCommand(
  message: Message,
  _args: string[],
  prefix: string,
): Promise<void> {
  if (message.author.id !== OWNER_ID) return;

  const code = extractCode(message.content, prefix);
  if (!code) return;

  let output: string;
  try {
    const wrapped = `(async (message, client) => {\n${code}\n})`;
    // eslint-disable-next-line no-eval
    const result = await (0, eval)(wrapped)(message, message.client);
    output = inspect(result, { depth: 1 });
  } catch (error) {
    output = inspect(error, { depth: 1 });
  }

  output = redactSecrets(output);
  const chunks = chunkForDiscord(output);

  await message.reply(wrapCodeBlock(chunks[0]));
  for (const chunk of chunks.slice(1)) {
    await message.channel.send(wrapCodeBlock(chunk));
  }

  await safeDelete(message);
}
```

Notes on this step:
- `code` needs an implicit return to show expression results (e.g. `1 + 1` should show `2`). Wrap with `return eval(code)`-style behavior by prefixing the body: use `new Function`-style auto-return only for the simple case. To keep this simple and match the test expectations (`1 + 1` → contains `"2"`), change the wrapped template to attempt an expression return first:
  ```ts
  const wrapped = `(async (message, client) => {\nreturn (${code});\n})`;
  ```
  This makes `1 + 1` evaluate as `return (1 + 1)`, and `await Promise.resolve("done")` as `return (await Promise.resolve("done"))` — both valid. Statements like `throw new Error("boom")` remain valid inside `return (...)` only if they're expressions — `throw` is a statement, so wrapping it in `return (throw ...)` is a syntax error. Handle this by trying the expression-wrapped form first and falling back to the statement form on a `SyntaxError`:
  ```ts
  async function runEval(code: string, message: Message): Promise<unknown> {
    const client = message.client;
    try {
      const asExpr = `(async (message, client) => {\nreturn (${code});\n})`;
      return await (0, eval)(asExpr)(message, client);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const asStatements = `(async (message, client) => {\n${code}\n})`;
      return await (0, eval)(asStatements)(message, client);
    }
  }
  ```
  Then `handleEvalCommand` calls `runEval(code, message)` inside its `try/catch` instead of inlining the eval. Export `runEval` is not required (internal helper, not tested directly — covered transitively through `handleEvalCommand` tests).

Final file shape for the execution portion:
```ts
async function runEval(code: string, message: Message): Promise<unknown> {
  const client = message.client;
  try {
    const asExpr = `(async (message, client) => {\nreturn (${code});\n})`;
    return await (0, eval)(asExpr)(message, client);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const asStatements = `(async (message, client) => {\n${code}\n})`;
    return await (0, eval)(asStatements)(message, client);
  }
}

export async function handleEvalCommand(
  message: Message,
  _args: string[],
  prefix: string,
): Promise<void> {
  if (message.author.id !== OWNER_ID) return;

  const code = extractCode(message.content, prefix);
  if (!code) return;

  let output: string;
  try {
    const result = await runEval(code, message);
    output = inspect(result, { depth: 1 });
  } catch (error) {
    output = inspect(error, { depth: 1 });
  }

  output = redactSecrets(output);
  const chunks = chunkForDiscord(output);

  await message.reply(wrapCodeBlock(chunks[0]));
  for (const chunk of chunks.slice(1)) {
    await message.channel.send(wrapCodeBlock(chunk));
  }

  await safeDelete(message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: PASS — all `handleEvalCommand` tests green, plus every helper test from Tasks 2-4 still green.

- [ ] **Step 5: Commit**

```bash
git add src/features/eval/handlers/eval.handler.ts tests/unit/features/eval/handler.test.ts
git commit -m "feat(eval): implement handleEvalCommand with owner gate, redaction, and output splitting"
```

---

### Task 6: Wire into the command registry

**Files:**
- Create: `src/features/eval/index.ts`
- Modify: `src/commands/registry.ts`

**Interfaces:**
- Consumes: `handleEvalCommand` from `src/features/eval/handlers/eval.handler.ts` (Task 5).
- Produces: `getCommand("eval")` and `getCommand("ev")` both resolve to the eval command.

- [ ] **Step 1: Create the barrel file**

```ts
export { handleEvalCommand } from "./handlers/eval.handler";
```
Save as `src/features/eval/index.ts`.

- [ ] **Step 2: Write a failing test for registry wiring**

Add to `tests/unit/features/eval/handler.test.ts` (or a new small test — reuse the same file to avoid an extra file for one assertion):
```ts
import { getCommand } from "@/commands/registry";

describe("eval command registration", () => {
  it("is registered under name 'eval' and alias 'ev'", () => {
    expect(getCommand("eval")?.name).toBe("eval");
    expect(getCommand("ev")?.name).toBe("eval");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: FAIL — `getCommand("eval")` returns `undefined`.

- [ ] **Step 4: Register the command**

Edit `src/commands/registry.ts`:
```ts
import { handleNoteCommand, handleHistoryCommand, handleStatsCommand } from "@/features/mod-actions";
import { handleEvalCommand } from "@/features/eval";
```
And add to the `commands` array (after the `stats` entry):
```ts
  {
    name: "eval",
    aliases: ["ev"],
    execute: handleEvalCommand,
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/unit/features/eval/handler.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `bun test --isolate`
Expected: all tests pass, no regressions in other features.

- [ ] **Step 7: Confirm `eval` is absent from the help catalog**

Run: `grep -n '"eval"' src/commands/help/catalog.ts`
Expected: no output (empty) — confirms the command was not accidentally added to `m!help`.

- [ ] **Step 8: Commit**

```bash
git add src/features/eval/index.ts src/commands/registry.ts tests/unit/features/eval/handler.test.ts
git commit -m "feat(eval): register eval command in command registry"
```

---

## Verification

1. `bun test --isolate` — full suite green.
2. Manual smoke test (optional, requires `bun start-dev` + a real Discord message from the owner account): send `m!eval 1+1`, confirm bot replies `2` and deletes the original message. Send `m!eval process.env.DISCORD_TOKEN`, confirm the reply shows `[REDACTED]`, not the real token.
