# Midubot — Agent Instructions

Discord moderation bot (Bun + TypeScript + discord.js + Drizzle). Follow these rules in every session.

## Codebase Memory MCP (required)

Always use **codebase-memory-mcp** for structural exploration before grep/file walks:

1. Check MCP tools are available (`list_projects`, `search_graph`, `trace_path`, etc.).
2. If the project is not indexed: `index_repository` with absolute path `/home/awsm/dev/midubot`.
3. Prefer graph tools for architecture, callers/callees, impact, and symbol lookup.
4. Fall back to Grep/Read only for text search or when graph coverage is missing.

**If MCP is missing or tools do not appear:**

- Binary may already exist at `~/.local/bin/codebase-memory-mcp`.
- Install / reconfigure: https://github.com/DeusData/codebase-memory-mcp
- One-liner: `curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash`
- Then restart the agent and confirm the server is listed.

Project MCP config lives in `.cursor/mcp.json`.

## Commits

When the user asks to commit:

- Use **caveman-commit** style: Conventional Commits, subject ≤50 chars when possible, body only for non-obvious why.
- **Never** add trailers or footers for AI attribution: no `Co-authored-by`, no `Generated with …`, no `Assisted-by`, no Cursor/Claude/Copilot credit lines.
- Message is plain human commit only. Example: `feat(ai): add test subcommand for superdevs`

## Version bumps (after finishing work)

When a feature, fix, or meaningful change is **done**, suggest a `package.json` version bump. Do not bump unless the user agrees.

SemVer (current pattern in this repo: `MAJOR.MINOR.PATCH`):

| Change | Bump | Example |
|--------|------|---------|
| Breaking API / behavior | major | `3.5.2` → `4.0.0` |
| New feature / command | minor | `3.5.2` → `3.6.0` |
| Bugfix / small chore | patch | `3.5.2` → `3.5.3` |

Suggest as: `chore: bump version to X.Y.Z` (same style as existing history). Include the suggested next version in the wrap-up of the task.
