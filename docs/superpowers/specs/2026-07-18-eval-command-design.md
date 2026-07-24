# Eval command — design

## Purpose

Owner-only Discord command to execute raw JS/TS in the running bot process, for live debugging. Highest-risk command in the codebase by design (full RCE in the bot's process) — the design's job is to bound the blast radius to "one hardcoded Discord user ID" and nothing else.

## Scope

- New feature module `src/features/eval/`.
- New command `eval` (alias `ev`) registered in `src/commands/registry.ts`.
- Out of scope: sandboxing (vm module, worker isolation), audit logging, rate limiting, confirmation prompts — explicitly rejected during brainstorming in favor of a minimal, single-gate design.

## Authorization

```ts
const OWNER_ID = "398321973404368927";
```

Hardcoded literal, not read from env/DB/config. Rationale: no config surface to tamper with — changing it requires editing source and redeploying.

Handler entry point checks `message.author.id !== OWNER_ID` and returns immediately with no reply, no reaction, no log line. Non-owner users get no signal the command exists or was blocked (avoids revealing an eval command is present to probe further).

## Execution

1. Extract code from the command args: strip a wrapping fenced code block (` ```js ... ``` ` / ` ``` ... ``` `) if present, else take the raw remainder of the message after the command/alias token.
2. Wrap the extracted code in an async IIFE closing over `message` and `client`, so the code can reference them directly and use top-level `await`:
   ```ts
   const wrapped = `(async (message, client) => { ${code} })`;
   const result = await eval(wrapped)(message, message.client);
   ```
3. `try/catch` around the eval + await. On throw, the caught error (message + stack) is formatted the same way as a successful result — not swallowed, not treated specially.

## Output formatting

- Serialize the result with `util.inspect(result, { depth: 1 })`.
- Redact secrets: before sending, scan the serialized string for any substring equal to a current `process.env` value (skip trivially short/empty values) and replace matches with `[REDACTED]`.
- Wrap in a ` ```js ` fenced code block. If the total message would exceed Discord's 2000-char limit, split the inspected output into multiple chunks (each re-wrapped in its own ` ```js ` fence, sized to stay under ~1900 chars per message) and send them as separate sequential messages instead of truncating — no content is dropped.
- The first chunk is sent as a reply to the triggering message; subsequent chunks are sent as plain follow-up messages in the same channel.

## Post-execution cleanup

After the result is sent (success or error path), delete the original command message (the one containing the raw eval code), so the executed code doesn't linger visibly in channel history/scrollback. Deletion failure (e.g. already deleted, missing permission) is caught and ignored — it must not affect the reply already sent.

## Explicitly not doing

- No audit logging of eval usage (who/when/what code) — accepted risk, since only the owner can invoke it.
- No sandbox/vm isolation — code runs with full process access (fs, env, network, process control). This is the accepted trade-off of choosing "raw JS debug eval" over a sandboxed or expression-only alternative.
- No rate limiting or cooldown.

## Residual risk (accepted)

This command is unrestricted RCE in the bot's process, gated by a single Discord user ID check. If that account is compromised (token theft, Discord account takeover), the attacker gets full control of the bot's host environment (env vars, filesystem, outbound network, process lifecycle). No mitigation beyond the ID gate is in scope for this design — accepted explicitly by the user.

## Testing

- Unit test the handler: non-owner ID → no reply, no eval call, no delete attempt.
- Unit test: owner ID + simple sync expression → correct reply content, original message delete attempted.
- Unit test: owner ID + code that returns a Promise/uses await → resolved value in reply.
- Unit test: owner ID + throwing code → error message/stack in reply, not swallowed silently.
- Unit test: redaction — mock `process.env` with a known value, eval code that returns it, assert `[REDACTED]` in output instead of the raw value.
- Unit test: splitting — eval code returning a long string, assert output is sent as multiple messages, each under Discord's limit, and concatenating their content (fences stripped) reproduces the full inspected output with nothing dropped.
