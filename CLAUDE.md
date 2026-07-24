# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Discord moderation bot for the midudev server. TypeScript, discord.js v14, Drizzle ORM with Turso (libsql), built with Bun.

## Commands

```bash
bun start-dev              # run locally (needs infisical for secrets)
bun test --isolate         # all tests
bun test tests/unit/services/hash.test.ts  # single test
bun run db:generate        # generate migration after schema change
bun run db:migrate         # apply migrations
bun run db:studio          # Drizzle Studio (DB browser)
```

Dev env uses `infisical run --env=dev` for secrets. Append `:dev` to any `db:*` script for dev env (e.g. `db:push:dev`).

## Architecture

- **Feature modules** (`src/features/<name>/`): each feature owns its commands, handlers, services, and barrel `index.ts`. Features: images (duplicate detection via dhash/fingerprinting), language, line-filter, link-cooldown, log-channel, puff (timeout+sweep moderation), reports (quorum-based), unique-channel, whitelist, system.
- **Command registry** (`src/commands/registry.ts`): prefix-based commands (`m!` default). Each command has name + aliases → handler fn. Context-menu commands (puff, reports) use discord.js interactions instead.
- **Events** (`src/events/`): thin handlers for `clientReady`, `messageCreate`, `interactionCreate`, `messageDelete` — delegate to feature handlers.
- **DB** (`src/db/`): Drizzle schema in `src/db/schema/`, one file per table. Connection via `src/db/connection.ts`. Migrations in `drizzle/`.
- **i18n** (`src/i18n/`): Spanish (default) and English translations.
- **Path alias**: `@/*` → `./src/*`.

## Conventions

- Language: codebase mixes Spanish and English. Commit messages use conventional commits in Spanish/English.
- Tests: Bun test runner, preload `tests/setup.ts` (sets test env vars). Mocks in `tests/mocks/` for DB and Discord. Tests in `tests/unit/` mirroring src structure.
- Build: tsdown (unbundled, ESNext target). Output to `dist/`.
- Secrets managed via Infisical (dev) or env vars (prod). See `.env.example`.
