# AI-Mod Feature Assembly Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble the ai-mod feature on top of Plan 1's infrastructure: add i18n keys, the five config commands, the feedback-button handler, the main `handleModMention` orchestration handler, alert-embed builders, and wire everything into the Discord event + command-registry pipelines. After this plan the feature is end-to-end functional.

**Architecture:** Builds on Plan 1's services (`AIClientService`, `classifier`, `context-builder`, `image-duplicate`, `feedback`, `cases`, `malicious-messages`, `ai-prompts`, `mod-role`, `notify-targets`, `selfpromo-bypass`, `ai-mod-config`, `ignored-channels`, plus the shared `isIgnored`). A pure `AlertBuilder` helper isolates embed/button construction from orchestration. The main handler `handleModMention` is wired into `message-create.ts`'s guild block; the feedback button is wired into `interaction-create.ts` via the `aimod_` customId prefix.

**Tech Stack:** TypeScript, discord.js v14.26, Drizzle ORM, Bun test runner.

## Global Constraints

- Path alias `@/*` → `./src/*`.
- Tests: Bun test runner with `--isolate` (mock-bleed between files is real; always use `--isolate`). Preload `tests/setup.ts`. Mocks in `tests/mocks/`.
- Run a single test: `bun test tests/unit/features/ai-mod/<file>.test.ts`. Run all: `bun test --isolate`.
- i18n: `src/i18n/en.ts` is the source of the `Translations` type (`export type Translations = typeof en;` in `src/i18n/index.ts`). Both `es.ts` and `en.ts` must declare **exactly the same keys** or the type breaks.
- Commit messages: conventional commits. One commit per task.
- discord.js v14.26 verified APIs (via context7): `message.reference` has `{ messageId?, channelId?, guildId? }`; `member.timeout(null, reason)` removes a timeout (use `null`, not `0`); `member.isCommunicationDisabled()` returns boolean; `message.mentions.roles` is `Collection<Snowflake, Role>`.
- Feature gating: `handleModMention` returns early unless `guild_configs.aiModEnabled === true` AND `env.AI_API_URL` + `env.AI_API_KEY` are set. Log a warning (not a throw) when env is missing.
- Reuse existing helpers: `safeDelete`, `safeTimeout` from `@/core/discord/moderation`; `LogChannelService` from `@/features/log-channel`; `LanguageService` from `@/features/language`; `extractPuffContent` from `@/features/puff`; `ImageService.addImage` + `ImageHashService.downloadFingerprint` from `@/features/images`.

---

## File Structure (this plan)

**Create:**
- `src/features/ai-mod/services/alert-builder.service.ts` — pure embed/button builders
- `src/features/ai-mod/handlers/mod-mention.handler.ts` — `handleModMention(message)`
- `src/features/ai-mod/handlers/feedback-button.handler.ts` — `handleFeedbackButton(interaction)`
- `src/features/ai-mod/commands/aimod.command.ts`
- `src/features/ai-mod/commands/modrole.command.ts`
- `src/features/ai-mod/commands/ignorechannel.command.ts`
- `src/features/ai-mod/commands/notify.command.ts`
- `src/features/ai-mod/commands/selfpromochannel.command.ts`
- Tests mirroring the above under `tests/unit/features/ai-mod/`

**Modify:**
- `src/i18n/es.ts` — add `aiMod` section
- `src/i18n/en.ts` — add `aiMod` section (identical key set)
- `src/commands/registry.ts` — register 5 commands
- `src/events/message-create.ts` — call `handleModMention` in guild block
- `src/events/interaction-create.ts` — route `aimod_` buttons to `handleFeedbackButton`
- `src/features/ai-mod/index.ts` — export new handlers + AlertBuilder

---

### Task 1: i18n keys (es + en)

Add the `aiMod` translation section to both language files with identical keys. No logic, pure data — tested by a smoke test that confirms the keys resolve via `getTranslation`.

**Files:**
- Modify: `src/i18n/es.ts`
- Modify: `src/i18n/en.ts`
- Test: `tests/unit/features/ai-mod/i18n.test.ts`

**Interfaces:**
- Produces: `t.aiMod.*` keys (full list below), accessible via `getTranslation(lang).aiMod`.

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/i18n.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { getTranslation } from "@/i18n";

describe("aiMod i18n keys", () => {
  it("es has all required aiMod keys", () => {
    const t = getTranslation("es");
    expect(t.aiMod).toBeDefined();
    expect(typeof t.aiMod.flagged_malicious_title).toBe("string");
    expect(typeof t.aiMod.flagged_selfpromo_title).toBe("string");
    expect(typeof t.aiMod.flagged_selfpromo_bypass_title).toBe("string");
    expect(typeof t.aiMod.precaution_title).toBe("string");
    expect(typeof t.aiMod.field_author).toBe("string");
    expect(typeof t.aiMod.field_channel).toBe("string");
    expect(typeof t.aiMod.field_confidence).toBe("string");
    expect(typeof t.aiMod.field_platform).toBe("string");
    expect(typeof t.aiMod.field_reason).toBe("string");
    expect(typeof t.aiMod.field_action).toBe("string");
    expect(typeof t.aiMod.action_timeout).toBe("string");
    expect(typeof t.aiMod.action_already_timeout).toBe("string");
    expect(typeof t.aiMod.action_bypass_allowed).toBe("string");
    expect(typeof t.aiMod.action_no_permission).toBe("string");
    expect(typeof t.aiMod.action_alert_only).toBe("string");
    expect(typeof t.aiMod.button_correct).toBe("string");
    expect(typeof t.aiMod.button_incorrect).toBe("string");
    expect(typeof t.aiMod.confirmed_by).toBe("string");
    expect(typeof t.aiMod.marked_incorrect_by).toBe("string");
    expect(typeof t.aiMod.timeout_removed).toBe("string");
    expect(typeof t.aiMod.no_permission).toBe("string");
    expect(typeof t.aiMod.case_already_resolved).toBe("string");
    expect(typeof t.aiMod.precaution_desc).toBe("string");
    expect(typeof t.aiMod.footer_case_id).toBe("string");
    expect(typeof t.aiMod.usage_aimod).toBe("string");
    expect(typeof t.aiMod.usage_modrole).toBe("string");
    expect(typeof t.aiMod.usage_ignorechannel).toBe("string");
    expect(typeof t.aiMod.usage_notify).toBe("string");
    expect(typeof t.aiMod.usage_selfpromochannel).toBe("string");
    expect(typeof t.aiMod.enabled_on).toBe("string");
    expect(typeof t.aiMod.enabled_off).toBe("string");
    expect(typeof t.aiMod.enabled_status_on).toBe("string");
    expect(typeof t.aiMod.enabled_status_off).toBe("string");
    expect(typeof t.aiMod.added).toBe("string");
    expect(typeof t.aiMod.removed).toBe("string");
    expect(typeof t.aiMod.already_present).toBe("string");
  });

  it("en has the same aiMod keys as es", () => {
    const esKeys = Object.keys(getTranslation("es").aiMod).sort();
    const enKeys = Object.keys(getTranslation("en").aiMod).sort();
    expect(enKeys).toEqual(esKeys);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/ai-mod/i18n.test.ts`
Expected: FAIL — `t.aiMod` undefined.

- [ ] **Step 3: Add the aiMod section to es.ts**

In `src/i18n/es.ts`, insert a new `aiMod` section immediately before the closing `};` of the exported object (after the `mod_actions` section). Use this exact block:
```ts
  aiMod: {
    flagged_malicious_title: "🚫 Spam/estafa detectado",
    flagged_selfpromo_title: "🚫 Autopromoción no permitida",
    flagged_selfpromo_bypass_title: "⚠️ Autopromoción fuera de canal permitido",
    precaution_title: "⚠️ Reporte no concluyente — revisión manual",
    precaution_desc: "Mensajes candidatos para revisión manual:",
    field_author: "Autor",
    field_channel: "Canal",
    field_confidence: "Confianza",
    field_platform: "Plataforma",
    field_reason: "Razón IA",
    field_action: "Acción",
    action_timeout: "Timeout 24h",
    action_already_timeout: "Ya está en timeout",
    action_bypass_allowed: "Permitido por bypass",
    action_no_permission: "Sin permisos del bot",
    action_alert_only: "Solo alerta (revisar)",
    button_correct: "✅ Correcto",
    button_incorrect: "❌ Incorrecto",
    confirmed_by: "✅ Confirmado por {user}",
    marked_incorrect_by: "❌ Marcado como incorrecto por {user}",
    timeout_removed: "Timeout removido",
    no_permission: "No tienes permiso para usar esto.",
    case_already_resolved: "Este caso ya fue resuelto.",
    footer_case_id: "case_id: {id}",
    usage_aimod: "Uso: `{prefix}aimod <on | off | status>`",
    usage_modrole: "Uso: `{prefix}modrole <add | remove> <@rol>`",
    usage_ignorechannel: "Uso: `{prefix}ignorechannel <add | remove> <#canal | id-categoria>`",
    usage_notify: "Uso: `{prefix}notify <add | remove> <@usuario | @rol>`",
    usage_selfpromochannel: "Uso: `{prefix}selfpromochannel <add | remove> <#canal>`",
    enabled_on: "✅ Moderación IA activada.",
    enabled_off: "✅ Moderación IA desactivada.",
    enabled_status_on: "📊 Moderación IA: **activada**",
    enabled_status_off: "📊 Moderación IA: **desactivada**",
    added: "✅ Agregado correctamente.",
    removed: "✅ Removido correctamente.",
    already_present: "❌ Ya estaba presente.",
  },
```

- [ ] **Step 4: Add the identical aiMod section to en.ts**

In `src/i18n/en.ts`, insert the same structure with English text, **same keys in the same order**, immediately before the closing `};` (after `mod_actions`):
```ts
  aiMod: {
    flagged_malicious_title: "🚫 Spam/scam detected",
    flagged_selfpromo_title: "🚫 Self-promotion not allowed",
    flagged_selfpromo_bypass_title: "⚠️ Self-promotion outside allowed channel",
    precaution_title: "⚠️ Inconclusive report — manual review",
    precaution_desc: "Candidate messages for manual review:",
    field_author: "Author",
    field_channel: "Channel",
    field_confidence: "Confidence",
    field_platform: "Platform",
    field_reason: "AI reason",
    field_action: "Action",
    action_timeout: "Timeout 24h",
    action_already_timeout: "Already in timeout",
    action_bypass_allowed: "Allowed by bypass",
    action_no_permission: "Bot lacks permissions",
    action_alert_only: "Alert only (review)",
    button_correct: "✅ Correct",
    button_incorrect: "❌ Incorrect",
    confirmed_by: "✅ Confirmed by {user}",
    marked_incorrect_by: "❌ Marked incorrect by {user}",
    timeout_removed: "Timeout removed",
    no_permission: "You don't have permission to use this.",
    case_already_resolved: "This case was already resolved.",
    footer_case_id: "case_id: {id}",
    usage_aimod: "Usage: `{prefix}aimod <on | off | status>`",
    usage_modrole: "Usage: `{prefix}modrole <add | remove> <@role>`",
    usage_ignorechannel: "Usage: `{prefix}ignorechannel <add | remove> <#channel | category-id>`",
    usage_notify: "Usage: `{prefix}notify <add | remove> <@user | @role>`",
    usage_selfpromochannel: "Usage: `{prefix}selfpromochannel <add | remove> <#channel>`",
    enabled_on: "✅ AI moderation enabled.",
    enabled_off: "✅ AI moderation disabled.",
    enabled_status_on: "📊 AI moderation: **enabled**",
    enabled_status_off: "📊 AI moderation: **disabled**",
    added: "✅ Added successfully.",
    removed: "✅ Removed successfully.",
    already_present: "❌ Already present.",
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test tests/unit/features/ai-mod/i18n.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite to confirm no i18n type regressions**

Run: `bun test --isolate`
Expected: PASS — same baseline (512 pass, 1 pre-existing `handleHistoryCommand` fail) plus the 2 new i18n tests.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/es.ts src/i18n/en.ts tests/unit/features/ai-mod/i18n.test.ts
git commit -m "feat(ai-mod): add i18n keys for ai-mod feature (es/en)"
```

---

### Task 2: alert-builder.service — pure embed/button builders

Pure functions that build the flagged embed + button row, the precaution embed, and the ping string. No Discord state, no DB — fully unit-testable with the project's mock message helpers.

**Files:**
- Create: `src/features/ai-mod/services/alert-builder.service.ts`
- Modify: `src/features/ai-mod/index.ts`
- Test: `tests/unit/features/ai-mod/alert-builder.service.test.ts`

**Interfaces:**
- Produces:
  - `interface FlaggedEmbedInput { caseId: number; authorTag: string; authorId: string; channelId: string; confidence: number; platform: number; verdict: number; reason: string; actionLabel: string; }`
  - `buildFlaggedEmbed(input: FlaggedEmbedInput, t: Translations): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }`
  - `buildPrecautionEmbed(candidates: { url: string; authorTag: string }[], t: Translations): EmbedBuilder`
  - `buildPingString(targets: { targetId: string; targetType: "user" | "role" }[]): string`

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/alert-builder.service.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { getTranslation } from "@/i18n";
import {
  buildFlaggedEmbed,
  buildPrecautionEmbed,
  buildPingString,
} from "@/features/ai-mod/services/alert-builder.service";

const t = getTranslation("es");

describe("buildPingString", () => {
  it("formats users and roles", () => {
    const s = buildPingString([
      { targetId: "u1", targetType: "user" },
      { targetId: "r1", targetType: "role" },
    ]);
    expect(s).toBe("<@u1> <@&r1>");
  });
  it("returns empty string for no targets", () => {
    expect(buildPingString([])).toBe("");
  });
});

describe("buildFlaggedEmbed", () => {
  it("builds an embed with buttons for a malicious verdict", () => {
    const { embed, components } = buildFlaggedEmbed(
      {
        caseId: 42,
        authorTag: "spammer#0001",
        authorId: "u1",
        channelId: "c1",
        confidence: 0.9,
        platform: 0,
        verdict: 1,
        reason: "estafa cripto",
        actionLabel: t.aiMod.action_timeout,
      },
      t,
    );
    const data = embed.toJSON();
    expect(data.title).toContain("Spam");
    expect(components).toHaveLength(1);
    expect(components[0].components).toHaveLength(2);
    const customIds = components[0].components.map((b) => b.toJSON().custom_id);
    expect(customIds).toContain("aimod_42_correct");
    expect(customIds).toContain("aimod_42_incorrect");
  });

  it("includes platform field only for v=2", () => {
    const withPlatform = buildFlaggedEmbed(
      { caseId: 1, authorTag: "x", authorId: "u", channelId: "c", confidence: 0.8, platform: 4, verdict: 2, reason: "r", actionLabel: t.aiMod.action_timeout },
      t,
    );
    const fields = (withPlatform.embed.toJSON().fields ?? []).map((f) => f.name);
    expect(fields).toContain(t.aiMod.field_platform);

    const noPlatform = buildFlaggedEmbed(
      { caseId: 1, authorTag: "x", authorId: "u", channelId: "c", confidence: 0.9, platform: 0, verdict: 1, reason: "r", actionLabel: t.aiMod.action_timeout },
      t,
    );
    const fieldsNoP = (noPlatform.embed.toJSON().fields ?? []).map((f) => f.name);
    expect(fieldsNoP).not.toContain(t.aiMod.field_platform);
  });
});

describe("buildPrecautionEmbed", () => {
  it("lists candidate messages with links and authors", () => {
    const embed = buildPrecautionEmbed(
      [{ url: "https://discord.com/channels/g/c/m1", authorTag: "user#0001" }],
      t,
    );
    const data = embed.toJSON();
    expect(data.title).toContain("no concluyente");
    expect(data.description).toContain("m1");
    expect(data.description).toContain("user#0001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/ai-mod/alert-builder.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the alert builder**

`src/features/ai-mod/services/alert-builder.service.ts`:
```ts
import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import type { Translations } from "@/i18n";

export interface FlaggedEmbedInput {
  caseId: number;
  authorTag: string;
  authorId: string;
  channelId: string;
  confidence: number;
  platform: number;
  verdict: number;
  reason: string;
  actionLabel: string;
}

const PLATFORM_LABEL: Record<number, string> = {
  0: "—",
  1: "YouTube",
  2: "LinkedIn",
  3: "X / Instagram",
  4: "Otra",
};

export function buildPingString(
  targets: { targetId: string; targetType: "user" | "role" }[],
): string {
  return targets
    .map((tgt) =>
      tgt.targetType === "role"
        ? `<@&${tgt.targetId}>`
        : `<@${tgt.targetId}>`,
    )
    .join(" ");
}

export function buildFlaggedEmbed(
  input: FlaggedEmbedInput,
  t: Translations,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const isSelfpromo = input.verdict === 2;
  const title = isSelfpromo
    ? input.platform === 4
      ? t.aiMod.flagged_selfpromo_title
      : t.aiMod.flagged_selfpromo_bypass_title
    : t.aiMod.flagged_malicious_title;
  const color = isSelfpromo && input.platform !== 4 ? 0xffaa00 : 0xff4d4d;

  const fields = [
    { name: t.aiMod.field_author, value: `${input.authorTag} (${input.authorId})`, inline: true },
    { name: t.aiMod.field_channel, value: `<#${input.channelId}>`, inline: true },
    { name: t.aiMod.field_confidence, value: `${Math.round(input.confidence * 100)}%`, inline: true },
  ];
  if (isSelfpromo) {
    fields.push({ name: t.aiMod.field_platform, value: PLATFORM_LABEL[input.platform] ?? "—", inline: true });
  }
  fields.push({ name: t.aiMod.field_reason, value: (input.reason || "—").slice(0, 1024), inline: false });
  fields.push({ name: t.aiMod.field_action, value: input.actionLabel, inline: false });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(fields)
    .setFooter({ text: t.aiMod.footer_case_id.replace("{id}", String(input.caseId)) })
    .setTimestamp();

  const correctBtn = new ButtonBuilder()
    .setCustomId(`aimod_${input.caseId}_correct`)
    .setLabel(t.aiMod.button_correct)
    .setStyle(ButtonStyle.Success);
  const incorrectBtn = new ButtonBuilder()
    .setCustomId(`aimod_${input.caseId}_incorrect`)
    .setLabel(t.aiMod.button_incorrect)
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    correctBtn,
    incorrectBtn,
  );

  return { embed, components: [row] };
}

export function buildPrecautionEmbed(
  candidates: { url: string; authorTag: string }[],
  t: Translations,
): EmbedBuilder {
  const description =
    candidates.length === 0
      ? t.aiMod.precaution_desc
      : candidates
          .map((c) => `- [msg](${c.url}) — ${c.authorTag}`)
          .join("\n");

  return new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle(t.aiMod.precaution_title)
    .setDescription(description.slice(0, 4096))
    .setTimestamp();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/unit/features/ai-mod/alert-builder.service.test.ts`
Expected: PASS (4 tests). If the `custom_id` assertion fails because `toJSON()` does not expose `custom_id` on a ButtonBuilder, change the assertion to use the builder's `data.custom_id` instead: `components[0].components.map((b) => (b as unknown as { data: { custom_id: string } }).data.custom_id)`. Apply this correction only if needed.

- [ ] **Step 5: Export from the barrel**

Append to `src/features/ai-mod/index.ts`:
```ts
export {
  buildFlaggedEmbed,
  buildPrecautionEmbed,
  buildPingString,
  type FlaggedEmbedInput,
} from "./services/alert-builder.service";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-mod/services/alert-builder.service.ts \
        src/features/ai-mod/index.ts \
        tests/unit/features/ai-mod/alert-builder.service.test.ts
git commit -m "feat(ai-mod): add alert builder service for embeds and buttons"
```

---

### Task 3: Five config commands + registry wiring

The five `m!*` commands. Each follows the whitelist-command pattern: parse subcommand, check `ManageGuild`, call the matching Plan 1 service, reply with i18n status. `m!aimod` toggles `aiModEnabled`. Register all five in the command registry.

**Files:**
- Create: `src/features/ai-mod/commands/aimod.command.ts`
- Create: `src/features/ai-mod/commands/modrole.command.ts`
- Create: `src/features/ai-mod/commands/ignorechannel.command.ts`
- Create: `src/features/ai-mod/commands/notify.command.ts`
- Create: `src/features/ai-mod/commands/selfpromochannel.command.ts`
- Modify: `src/commands/registry.ts`
- Modify: `src/features/ai-mod/index.ts`
- Test: `tests/unit/features/ai-mod/commands.test.ts`

**Interfaces:**
- Each command exports `handle<Name>Command(message: Message, args: string[], prefix: string): Promise<void>`.
- Consumes: `AiModConfigService`, `ModRoleService`, `IgnoredChannelsService`, `NotifyTargetsService`, `SelfpromoBypassService` (Plan 1).
- Consumes: `LanguageService.getLanguage(guildId)`, `getTranslation(lang)`.

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/commands.test.ts`:
```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage } from "../../../mocks/discord";

// Mock all services the commands depend on.
const configMock = {
  isEnabled: mock(async () => false),
  setEnabled: mock(async () => {}),
};
const modRoleMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};
const ignoredMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};
const notifyMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};
const bypassMock = {
  add: mock(async () => {}),
  remove: mock(async () => {}),
  list: mock(async () => []),
};

mock.module("@/features/ai-mod/services/ai-mod-config.service", () => ({
  AiModConfigService: configMock,
}));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({
  ModRoleService: modRoleMock,
}));
mock.module("@/features/ai-mod/services/ignored-channels.service", () => ({
  IgnoredChannelsService: ignoredMock,
}));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({
  NotifyTargetsService: notifyMock,
}));
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({
  SelfpromoBypassService: bypassMock,
}));

import { handleAimodCommand } from "@/features/ai-mod/commands/aimod.command";
import { handleModroleCommand } from "@/features/ai-mod/commands/modrole.command";
import { handleIgnorechannelCommand } from "@/features/ai-mod/commands/ignorechannel.command";
import { handleNotifyCommand } from "@/features/ai-mod/commands/notify.command";
import { handleSelfpromochannelCommand } from "@/features/ai-mod/commands/selfpromochannel.command";

function makeMsg(argsManageGuild = true): ReturnType<typeof createMockMessage> {
  const msg = createMockMessage({});
  (msg.member as unknown as { permissions: { has: (p: string) => boolean } }).permissions = {
    has: (p: string) => p === "ManageGuild" && argsManageGuild,
  };
  return msg;
}

beforeEach(() => {
  configMock.isEnabled.mockClear();
  configMock.setEnabled.mockClear();
  modRoleMock.add.mockClear();
  modRoleMock.remove.mockClear();
  ignoredMock.add.mockClear();
  ignoredMock.remove.mockClear();
  notifyMock.add.mockClear();
  notifyMock.remove.mockClear();
  bypassMock.add.mockClear();
  bypassMock.remove.mockClear();
});

describe("handleAimodCommand", () => {
  it("shows usage with no subcommand", async () => {
    const msg = makeMsg();
    await handleAimodCommand(msg, [], "m!");
    expect(msg.reply).toHaveBeenCalled();
    expect(configMock.setEnabled).not.toHaveBeenCalled();
  });
  it("enables the feature on 'on'", async () => {
    const msg = makeMsg();
    await handleAimodCommand(msg, ["on"], "m!");
    expect(configMock.setEnabled).toHaveBeenCalledWith("g1", true);
  });
  it("disables the feature on 'off'", async () => {
    const msg = makeMsg();
    await handleAimodCommand(msg, ["off"], "m!");
    expect(configMock.setEnabled).toHaveBeenCalledWith("g1", false);
  });
  it("reports status on 'status'", async () => {
    configMock.isEnabled.mockImplementation(async () => true);
    const msg = makeMsg();
    await handleAimodCommand(msg, ["status"], "m!");
    expect(configMock.isEnabled).toHaveBeenCalledWith("g1");
  });
  it("denies without ManageGuild", async () => {
    const msg = makeMsg(false);
    await handleAimodCommand(msg, ["on"], "m!");
    expect(configMock.setEnabled).not.toHaveBeenCalled();
  });
});

describe("handleModroleCommand", () => {
  it("adds a role from a mention", async () => {
    const msg = makeMsg();
    await handleModroleCommand(msg, ["add", "<@&9999>"], "m!");
    expect(modRoleMock.add).toHaveBeenCalledWith("g1", "9999");
  });
  it("removes a role from a mention", async () => {
    const msg = makeMsg();
    await handleModroleCommand(msg, ["remove", "<@&9999>"], "m!");
    expect(modRoleMock.remove).toHaveBeenCalledWith("g1", "9999");
  });
  it("shows usage with no args", async () => {
    const msg = makeMsg();
    await handleModroleCommand(msg, [], "m!");
    expect(modRoleMock.add).not.toHaveBeenCalled();
  });
});

describe("handleIgnorechannelCommand", () => {
  it("adds a channel mention as channel type", async () => {
    const msg = makeMsg();
    await handleIgnorechannelCommand(msg, ["add", "<#1234>"], "m!");
    expect(ignoredMock.add).toHaveBeenCalledWith("g1", "1234", "channel");
  });
  it("adds a raw id as category type", async () => {
    const msg = makeMsg();
    await handleIgnorechannelCommand(msg, ["add", "5678"], "m!");
    expect(ignoredMock.add).toHaveBeenCalledWith("g1", "5678", "category");
  });
});

describe("handleNotifyCommand", () => {
  it("adds a user mention as user type", async () => {
    const msg = makeMsg();
    await handleNotifyCommand(msg, ["add", "<@1234>"], "m!");
    expect(notifyMock.add).toHaveBeenCalledWith("g1", "1234", "user");
  });
  it("adds a role mention as role type", async () => {
    const msg = makeMsg();
    await handleNotifyCommand(msg, ["add", "<@&1234>"], "m!");
    expect(notifyMock.add).toHaveBeenCalledWith("g1", "1234", "role");
  });
});

describe("handleSelfpromochannelCommand", () => {
  it("adds a channel from a mention", async () => {
    const msg = makeMsg();
    await handleSelfpromochannelCommand(msg, ["add", "<#1234>"], "m!");
    expect(bypassMock.add).toHaveBeenCalledWith("g1", "1234");
  });
  it("removes a channel", async () => {
    const msg = makeMsg();
    await handleSelfpromochannelCommand(msg, ["remove", "<#1234>"], "m!");
    expect(bypassMock.remove).toHaveBeenCalledWith("g1", "1234");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/ai-mod/commands.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement aimod.command.ts**

`src/features/ai-mod/commands/aimod.command.ts`:
```ts
import { Message, PermissionFlagsBits } from "discord.js";
import { AiModConfigService } from "../services/ai-mod-config.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

export async function handleAimodCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_aimod.replace("{prefix}", prefix);

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 1) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  try {
    if (sub === "on") {
      await AiModConfigService.setEnabled(guildId, true);
      await message.reply(t.aiMod.enabled_on);
    } else if (sub === "off") {
      await AiModConfigService.setEnabled(guildId, false);
      await message.reply(t.aiMod.enabled_off);
    } else if (sub === "status") {
      const enabled = await AiModConfigService.isEnabled(guildId);
      await message.reply(enabled ? t.aiMod.enabled_status_on : t.aiMod.enabled_status_off);
    } else {
      await message.reply(usage);
    }
  } catch {
    await message.reply(t.commands.error);
  }
}
```

- [ ] **Step 4: Implement modrole.command.ts**

`src/features/ai-mod/commands/modrole.command.ts`:
```ts
import { Message, PermissionFlagsBits } from "discord.js";
import { ModRoleService } from "../services/mod-role.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

export async function handleModroleCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_modrole.replace("{prefix}", prefix);

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 2) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  const roleArg = args[1];
  const mention = roleArg.match(/^<@&(\d+)>$/);
  const roleId = mention ? mention[1] : /^\d{17,19}$/.test(roleArg) ? roleArg : null;
  if (!roleId) {
    await message.reply(usage);
    return;
  }

  try {
    if (sub === "add") {
      await ModRoleService.add(guildId, roleId);
      await message.reply(t.aiMod.added);
    } else if (sub === "remove" || sub === "rm") {
      await ModRoleService.remove(guildId, roleId);
      await message.reply(t.aiMod.removed);
    } else {
      await message.reply(usage);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(msg.includes("Already") ? t.aiMod.already_present : t.commands.error);
  }
}
```

- [ ] **Step 5: Implement ignorechannel.command.ts**

`src/features/ai-mod/commands/ignorechannel.command.ts`:
```ts
import { Message, PermissionFlagsBits } from "discord.js";
import { IgnoredChannelsService } from "../services/ignored-channels.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

export async function handleIgnorechannelCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_ignorechannel.replace("{prefix}", prefix);

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 2) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  const arg = args[1];
  const channelMention = arg.match(/^<#(\d+)>$/);
  const isChannel = !!channelMention;
  const targetId = channelMention ? channelMention[1] : /^\d{17,19}$/.test(arg) ? arg : null;
  if (!targetId) {
    await message.reply(usage);
    return;
  }
  const targetType = isChannel ? "channel" : "category";

  try {
    if (sub === "add") {
      await IgnoredChannelsService.add(guildId, targetId, targetType);
      await message.reply(t.aiMod.added);
    } else if (sub === "remove" || sub === "rm") {
      await IgnoredChannelsService.remove(guildId, targetId);
      await message.reply(t.aiMod.removed);
    } else {
      await message.reply(usage);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(msg.includes("Already") ? t.aiMod.already_present : t.commands.error);
  }
}
```

- [ ] **Step 6: Implement notify.command.ts**

`src/features/ai-mod/commands/notify.command.ts`:
```ts
import { Message, PermissionFlagsBits } from "discord.js";
import { NotifyTargetsService, type NotifyTargetType } from "../services/notify-targets.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

export async function handleNotifyCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_notify.replace("{prefix}", prefix);

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 2) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  const arg = args[1];
  const roleMention = arg.match(/^<@&(\d+)>$/);
  const userMention = arg.match(/^<@!?(\d+)>$/);
  let targetId: string | null = null;
  let targetType: NotifyTargetType = "user";
  if (roleMention) {
    targetId = roleMention[1];
    targetType = "role";
  } else if (userMention) {
    targetId = userMention[1];
    targetType = "user";
  } else if (/^\d{17,19}$/.test(arg)) {
    targetId = arg;
    targetType = "user";
  }
  if (!targetId) {
    await message.reply(usage);
    return;
  }

  try {
    if (sub === "add") {
      await NotifyTargetsService.add(guildId, targetId, targetType);
      await message.reply(t.aiMod.added);
    } else if (sub === "remove" || sub === "rm") {
      await NotifyTargetsService.remove(guildId, targetId);
      await message.reply(t.aiMod.removed);
    } else {
      await message.reply(usage);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(msg.includes("Already") ? t.aiMod.already_present : t.commands.error);
  }
}
```

- [ ] **Step 7: Implement selfpromochannel.command.ts**

`src/features/ai-mod/commands/selfpromochannel.command.ts`:
```ts
import { Message, PermissionFlagsBits } from "discord.js";
import { SelfpromoBypassService } from "../services/selfpromo-bypass.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";

export async function handleSelfpromochannelCommand(
  message: Message,
  args: string[],
  prefix: string,
): Promise<void> {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);
  const usage = t.aiMod.usage_selfpromochannel.replace("{prefix}", prefix);

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply(t.aiMod.no_permission);
    return;
  }

  if (args.length < 2) {
    await message.reply(usage);
    return;
  }

  const sub = args[0].toLowerCase();
  const arg = args[1];
  const mention = arg.match(/^<#(\d+)>$/);
  const channelId = mention ? mention[1] : /^\d{17,19}$/.test(arg) ? arg : null;
  if (!channelId) {
    await message.reply(usage);
    return;
  }

  try {
    if (sub === "add") {
      await SelfpromoBypassService.add(guildId, channelId);
      await message.reply(t.aiMod.added);
    } else if (sub === "remove" || sub === "rm") {
      await SelfpromoBypassService.remove(guildId, channelId);
      await message.reply(t.aiMod.removed);
    } else {
      await message.reply(usage);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await message.reply(msg.includes("Already") ? t.aiMod.already_present : t.commands.error);
  }
}
```

- [ ] **Step 8: Register the five commands**

In `src/commands/registry.ts`, add imports after the existing feature imports:
```ts
import {
  handleAimodCommand,
  handleModroleCommand,
  handleIgnorechannelCommand,
  handleNotifyCommand,
  handleSelfpromochannelCommand,
} from "@/features/ai-mod";
```
Add five entries to the `commands` array (after the `eval` entry):
```ts
  {
    name: "aimod",
    aliases: ["aimod"],
    execute: handleAimodCommand,
  },
  {
    name: "modrole",
    aliases: ["modroles"],
    execute: handleModroleCommand,
  },
  {
    name: "ignorechannel",
    aliases: ["ignorech", "ic"],
    execute: handleIgnorechannelCommand,
  },
  {
    name: "notify",
    aliases: ["notif"],
    execute: handleNotifyCommand,
  },
  {
    name: "selfpromochannel",
    aliases: ["spc", "selfpromo"],
    execute: handleSelfpromochannelCommand,
  },
```

- [ ] **Step 9: Export commands from the ai-mod barrel**

Append to `src/features/ai-mod/index.ts`:
```ts
export { handleAimodCommand } from "./commands/aimod.command";
export { handleModroleCommand } from "./commands/modrole.command";
export { handleIgnorechannelCommand } from "./commands/ignorechannel.command";
export { handleNotifyCommand } from "./commands/notify.command";
export { handleSelfpromochannelCommand } from "./commands/selfpromochannel.command";
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `bun test tests/unit/features/ai-mod/commands.test.ts`
Expected: PASS (all command tests).

- [ ] **Step 11: Run the full suite**

Run: `bun test --isolate`
Expected: PASS — baseline plus new command tests; no regressions in registry-dependent tests.

- [ ] **Step 12: Commit**

```bash
git add src/features/ai-mod/commands/ \
        src/commands/registry.ts \
        src/features/ai-mod/index.ts \
        tests/unit/features/ai-mod/commands.test.ts
git commit -m "feat(ai-mod): add five config commands and register them"
```

---

### Task 4: feedback-button handler

Handles `aimod_<caseId>_<correct|incorrect>` button clicks: permission check, dedup insert into `malicious_messages`, the "incorrect" branch's second AI call + `ai_prompts` insert + timeout removal via `member.timeout(null, reason)`, and resolving the case row. Edits the embed to disable buttons and append the resolution note.

**Files:**
- Create: `src/features/ai-mod/handlers/feedback-button.handler.ts`
- Modify: `src/features/ai-mod/index.ts`
- Test: `tests/unit/features/ai-mod/feedback-button.handler.test.ts`

**Interfaces:**
- Produces: `handleFeedbackButton(interaction: ButtonInteraction): Promise<void>`.
- Consumes: `CasesService.get`, `CasesService.markResolved`, `MaliciousMessagesService.addIfAbsent`, `FeedbackService.generateAntiFpPrompt`, `AiPromptsService.add`, `ModRoleService.list`, `NotifyTargetsService.list`, `LanguageService`, `getTranslation`.

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/feedback-button.handler.test.ts`:
```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { ButtonInteraction } from "discord.js";

const casesMock = {
  get: mock(async () => ({
    id: 7, guildId: "g1", authorId: "spammer", channelId: "c1", messageId: "m1",
    content: "send me a DM", verdict: 1, confidence: 0.9, platform: 0,
    reason: "estafa", actionTaken: "timeout", resolved: false,
    resolvedBy: null, resolvedAction: null,
  })),
  markResolved: mock(async () => {}),
};
const maliciousMock = { addIfAbsent: mock(async () => {}) };
const feedbackMock = { generateAntiFpPrompt: mock(async () => "nota de contexto") };
const promptsMock = { add: mock(async () => {}) };
const modRoleMock = { list: mock(async () => []) };
const notifyMock = { list: mock(async () => []) };

mock.module("@/features/ai-mod/services/cases.service", () => ({ CasesService: casesMock }));
mock.module("@/features/ai-mod/services/malicious-messages.service", () => ({ MaliciousMessagesService: maliciousMock }));
mock.module("@/features/ai-mod/services/feedback.service", () => ({ FeedbackService: feedbackMock }));
mock.module("@/features/ai-mod/services/ai-prompts.service", () => ({ AiPromptsService: promptsMock }));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({ ModRoleService: modRoleMock }));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({ NotifyTargetsService: notifyMock }));

import { handleFeedbackButton } from "@/features/ai-mod/handlers/feedback-button.handler";

function makeInteraction(
  customId: string,
  opts: { manageMessages?: boolean; inModRoles?: boolean; inNotify?: boolean } = {},
): ButtonInteraction {
  const memberRoles = new Set(opts.inModRoles ? ["modrole-1"] : []);
  return {
    customId,
    guildId: "g1",
    guild: {
      id: "g1",
      members: {
        fetch: mock(async (id: string) => ({
          id,
          isCommunicationDisabled: () => true,
          timeout: mock(async () => {}),
        })),
      },
    },
    member: {
      permissions: { has: (p: string) => p === "ManageMessages" && !!opts.manageMessages },
      roles: { cache: { has: (r: string) => memberRoles.has(r) } },
      user: { id: "clicker", username: "modclicker" },
    },
    user: { id: "clicker", username: "modclicker" },
    message: { embeds: [], edit: mock(async () => {}) },
    replied: false,
    deferred: false,
    reply: mock(async () => {}),
    update: mock(async () => {}),
  } as unknown as ButtonInteraction;
}

beforeEach(() => {
  casesMock.get.mockClear();
  casesMock.markResolved.mockClear();
  maliciousMock.addIfAbsent.mockClear();
  feedbackMock.generateAntiFpPrompt.mockClear();
  promptsMock.add.mockClear();
});

describe("handleFeedbackButton", () => {
  it("replies no-permission when the clicker lacks perms and is not a mod/notify target", async () => {
    const ix = makeInteraction("aimod_7_correct", {});
    await handleFeedbackButton(ix);
    expect(ix.reply).toHaveBeenCalled();
    expect(casesMock.markResolved).not.toHaveBeenCalled();
  });

  it("correct: marks resolved and inserts malicious=true", async () => {
    const ix = makeInteraction("aimod_7_correct", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", true);
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "correct");
    expect(ix.update).toHaveBeenCalled();
  });

  it("incorrect: inserts malicious=false, generates a prompt, removes timeout, marks resolved", async () => {
    const ix = makeInteraction("aimod_7_incorrect", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", false);
    expect(feedbackMock.generateAntiFpPrompt).toHaveBeenCalled();
    expect(promptsMock.add).toHaveBeenCalledWith("g1", "nota de contexto");
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "incorrect");
  });

  it("incorrect with AI failure still removes timeout and marks resolved (no prompt insert)", async () => {
    feedbackMock.generateAntiFpPrompt.mockImplementation(async () => null);
    const ix = makeInteraction("aimod_7_incorrect", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(maliciousMock.addIfAbsent).toHaveBeenCalledWith("g1", "send me a DM", false);
    expect(promptsMock.add).not.toHaveBeenCalled();
    expect(casesMock.markResolved).toHaveBeenCalledWith(7, "clicker", "incorrect");
  });

  it("already-resolved case is a no-op with an ephemeral reply", async () => {
    casesMock.get.mockImplementation(async () => ({ ...((await casesMock.get.mock.calls[0]?.[0]) ?? {}), resolved: true } as never));
    // simpler: override directly
    casesMock.get = mock(async () => ({
      id: 7, guildId: "g1", authorId: "spammer", channelId: "c1", messageId: "m1",
      content: "send me a DM", verdict: 1, confidence: 0.9, platform: 0,
      reason: "estafa", actionTaken: "timeout", resolved: true,
      resolvedBy: "x", resolvedAction: "correct",
    })) as never;
    const ix = makeInteraction("aimod_7_correct", { manageMessages: true });
    await handleFeedbackButton(ix);
    expect(casesMock.markResolved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/ai-mod/feedback-button.handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the feedback-button handler**

`src/features/ai-mod/handlers/feedback-button.handler.ts`:
```ts
import { ButtonInteraction, PermissionFlagsBits } from "discord.js";
import { CasesService } from "../services/cases.service";
import { MaliciousMessagesService } from "../services/malicious-messages.service";
import { FeedbackService } from "../services/feedback.service";
import { AiPromptsService } from "../services/ai-prompts.service";
import { ModRoleService } from "../services/mod-role.service";
import { NotifyTargetsService } from "../services/notify-targets.service";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { logger } from "@/core/logger";

export async function handleFeedbackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const lang = await LanguageService.getLanguage(guildId);
  const t = getTranslation(lang);

  const parts = interaction.customId.split("_");
  // ["aimod", "<caseId>", "correct"|"incorrect"]
  if (parts.length < 3) return;
  const caseId = Number(parts[1]);
  const action = parts[2];
  if (Number.isNaN(caseId) || (action !== "correct" && action !== "incorrect")) return;

  // Permission: ManageMessages, OR a role in mod_roles, OR a user in notify_targets.
  const member = interaction.member;
  const hasManageMessages =
    !!member && "permissions" in member &&
    (member as { permissions: { has: (p: string) => boolean } }).permissions?.has(PermissionFlagsBits.ManageMessages);

  let allowed = !!hasManageMessages;
  if (!allowed) {
    const [modRoles, notifyTargets] = await Promise.all([
      ModRoleService.list(guildId),
      NotifyTargetsService.list(guildId),
    ]);
    const memberRoleIds =
      member && "roles" in member
        ? (member as { roles: { cache: { has: (r: string) => boolean } } }).roles?.cache
        : null;
    allowed =
      modRoles.some((r) => memberRoleIds?.has(r.roleId)) ||
      notifyTargets.some((n) => n.targetType === "user" && n.targetId === interaction.user.id);
  }
  if (!allowed) {
    await interaction.reply({ content: t.aiMod.no_permission, ephemeral: true });
    return;
  }

  const caseRow = await CasesService.get(caseId);
  if (!caseRow) {
    await interaction.reply({ content: t.aiMod.case_already_resolved, ephemeral: true });
    return;
  }
  if (caseRow.resolved) {
    await interaction.reply({ content: t.aiMod.case_already_resolved, ephemeral: true });
    return;
  }

  const clickerTag = interaction.user.username;

  if (action === "correct") {
    await MaliciousMessagesService.addIfAbsent(caseRow.guildId, caseRow.content, true);
    await CasesService.markResolved(caseId, interaction.user.id, "correct");
    await disableButtonsAndNote(interaction, t.aiMod.confirmed_by.replace("{user}", clickerTag));
    return;
  }

  // action === "incorrect"
  await MaliciousMessagesService.addIfAbsent(caseRow.guildId, caseRow.content, false);

  const note = await FeedbackService.generateAntiFpPrompt(
    caseRow.content,
    caseRow.verdict,
    caseRow.confidence,
    caseRow.reason ?? "",
    lang,
  );
  if (note) {
    try {
      await AiPromptsService.add(caseRow.guildId, note);
    } catch (e) {
      logger.warn(`ai-mod feedback: failed to insert ai_prompt: ${e}`);
    }
  }

  // Remove the timeout on the original author.
  try {
    const guild = interaction.guild;
    if (guild) {
      const offender = await guild.members.fetch(caseRow.authorId).catch(() => null);
      if (offender && offender.isCommunicationDisabled()) {
        await offender.timeout(null, "ai-mod feedback: marked incorrect").catch((e: unknown) => {
          logger.warn(`ai-mod feedback: failed to remove timeout: ${e}`);
        });
      }
    }
  } catch (e) {
    logger.warn(`ai-mod feedback: error removing timeout: ${e}`);
  }

  await CasesService.markResolved(caseId, interaction.user.id, "incorrect");
  await disableButtonsAndNote(
    interaction,
    `${t.aiMod.marked_incorrect_by.replace("{user}", clickerTag)}\n${t.aiMod.timeout_removed}`,
  );
}

async function disableButtonsAndNote(
  interaction: ButtonInteraction,
  note: string,
): Promise<void> {
  try {
    const message = interaction.message;
    const embeds = message.embeds.map((e) => e);
    // Append the note to the first embed's description.
    if (embeds.length > 0) {
      const first = embeds[0];
      const builder = first.toJSON();
      const extra = `\n\n${note}`;
      builder.description = `${builder.description ?? ""}${extra}`.slice(0, 4096);
      await interaction.update({ embeds: [builder], components: [] });
      return;
    }
    await interaction.update({ content: note, components: [] });
  } catch (e) {
    logger.warn(`ai-mod feedback: failed to update message: ${e}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/unit/features/ai-mod/feedback-button.handler.test.ts`
Expected: PASS. If the `update` vs `reply` assertions need adjusting because the handler calls `update`, ensure the test asserts `ix.update` for the success branches (the test above checks `ix.update` for "correct" and asserts `markResolved` for "incorrect"; both are covered). If the "already-resolved" test's mock-reassignment approach causes issues, simplify by defining `casesMock.get` with a flag toggled per test instead of reassigning the mock.

- [ ] **Step 5: Export from the barrel**

Append to `src/features/ai-mod/index.ts`:
```ts
export { handleFeedbackButton } from "./handlers/feedback-button.handler";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-mod/handlers/feedback-button.handler.ts \
        src/features/ai-mod/index.ts \
        tests/unit/features/ai-mod/feedback-button.handler.test.ts
git commit -m "feat(ai-mod): add feedback button handler (correct/incorrect, timeout removal)"
```

---

### Task 5: mod-mention handler — the core orchestration

The trigger handler. Resolves candidates (reply → 1; else last 10 minus reporter/bots), routes text→AI and image→duplicate-scan, applies bypass + confidence bands, timeouts offending authors (skipping already-timed-out), persists new scam images, builds flagged/precaution alerts with buttons, inserts case rows, and pings notify targets in the log channel. All failures are non-destructive (no delete/timeout on error → precaution alert).

**Files:**
- Create: `src/features/ai-mod/handlers/mod-mention.handler.ts`
- Modify: `src/features/ai-mod/index.ts`
- Test: `tests/unit/features/ai-mod/mod-mention.handler.test.ts`

**Interfaces:**
- Produces: `handleModMention(message: Message): Promise<void>`.
- Consumes (all from Plan 1 / Task 2): `AiModConfigService.isEnabled`, `ModRoleService.hasRole`, `SelfpromoBypassService.isBypass`, `NotifyTargetsService.list`, `ContextBuilderService.buildContext`, `classifyBatch`, `ImageDuplicateService.checkImage`, `CasesService.insert`, `LogChannelService.getLogChannel`, `LanguageService`, `buildFlaggedEmbed`, `buildPrecautionEmbed`, `buildPingString`, `safeDelete`, `safeTimeout`, `extractPuffContent`, `ImageService.addImage`, `ImageHashService.downloadFingerprint`.

- [ ] **Step 1: Write the failing test**

`tests/unit/features/ai-mod/mod-mention.handler.test.ts`:
```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockMessage, createMockGuild, createMockTextChannel } from "../../../mocks/discord";

const envMock = {
  AI_API_URL: "https://ai.test/v1/chat/completions",
  AI_API_KEY: "test-key",
  AI_MODEL: "deepseek-v4-flash",
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
const classifyMock = mock(async () => ({ ok: false, entries: [] }) as never);
const imageDupMock = { checkImage: mock(async () => ({ flagged: false, reason: "" })) };
const casesMock = { insert: mock(async () => 1) };
const logChannelMock = { getLogChannel: mock(async () => null) };

mock.module("@/features/ai-mod/services/ai-mod-config.service", () => ({ AiModConfigService: configMock }));
mock.module("@/features/ai-mod/services/mod-role.service", () => ({ ModRoleService: modRoleMock }));
mock.module("@/features/ai-mod/services/selfpromo-bypass.service", () => ({ SelfpromoBypassService: bypassMock }));
mock.module("@/features/ai-mod/services/notify-targets.service", () => ({ NotifyTargetsService: notifyMock }));
mock.module("@/features/ai-mod/services/context-builder.service", () => ({ ContextBuilderService: contextMock }));
mock.module("@/features/ai-mod/services/classifier.service", () => ({ classifyBatch: classifyMock }));
mock.module("@/features/ai-mod/services/image-duplicate.service", () => ({ ImageDuplicateService: imageDupMock }));
mock.module("@/features/ai-mod/services/cases.service", () => ({ CasesService: casesMock }));
mock.module("@/features/log-channel", () => ({ LogChannelService: logChannelMock }));
mock.module("@/features/puff", () => ({
  extractPuffContent: (m: { content: string; attachments: { size: number } }) =>
    m.attachments.size > 0 ? { kind: "image", imageUrls: ["x"] } : m.content ? { kind: "text", text: m.content } : null,
}));

import { handleModMention } from "@/features/ai-mod/handlers/mod-mention.handler";

beforeEach(() => {
  configMock.isEnabled.mockImplementation(async () => true);
  modRoleMock.hasRole.mockImplementation(async () => true);
  classifyMock.mockImplementation(async () => ({ ok: false, entries: [] }) as never);
  classifyMock.mockClear();
});

describe("handleModMention", () => {
  it("returns early when the feature is disabled", async () => {
    configMock.isEnabled.mockImplementation(async () => false);
    const msg = makeReportMessage("r1");
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("returns early when no mod role is mentioned", async () => {
    modRoleMock.hasRole.mockImplementation(async () => false);
    const msg = makeReportMessage("r1");
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("returns early when the author is a bot", async () => {
    const msg = makeReportMessage("r1", { authorBot: true });
    await handleModMention(msg);
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("classifies a clean batch without alerting (no log channel)", async () => {
    classifyMock.mockImplementation(async () => ({ ok: true, entries: [] }) as never);
    const msg = makeReportMessage("r1");
    await handleModMention(msg);
    expect(classifyMock).toHaveBeenCalledTimes(1);
  });

  it("on a high-confidence malicious verdict, deletes the flagged message", async () => {
    classifyMock.mockImplementation(async () => ({
      ok: true,
      entries: [{ index: 0, v: 1, c: 0.95, r: "estafa", p: 0 }],
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "send me a DM", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(candidate.delete).toHaveBeenCalled();
  });

  it("bypasses a v=2 p∈{1,2,3} selfpromo in a bypass channel (no delete)", async () => {
    bypassMock.isBypass.mockImplementation(async () => true);
    classifyMock.mockImplementation(async () => ({
      ok: true,
      entries: [{ index: 0, v: 2, c: 0.9, r: "yt selfpromo", p: 1 }],
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "watch my yt", channelId: "c1", guildId: "g1" });
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect(candidate.delete).not.toHaveBeenCalled();
  });

  it("does not re-timeout an already-disabled author", async () => {
    classifyMock.mockImplementation(async () => ({
      ok: true,
      entries: [{ index: 0, v: 1, c: 0.95, r: "estafa", p: 0 }],
    }) as never);
    const candidate = createMockMessage({ id: "cand1", content: "scam", channelId: "c1", guildId: "g1" });
    (candidate.member as unknown as { isCommunicationDisabled: () => boolean }).isCommunicationDisabled = () => true;
    const msg = makeReportMessage("r1", { channelMessages: [candidate] });
    await handleModMention(msg);
    expect((candidate.member as unknown as { timeout: (d: number | null, r?: string) => Promise<unknown> }).timeout).not.toHaveBeenCalled();
  });
});

function makeReportMessage(
  mentionedRoleId: string,
  opts: { authorBot?: boolean; channelMessages?: ReturnType<typeof createMockMessage>[] } = {},
): ReturnType<typeof createMockMessage> {
  const channel = createMockTextChannel({
    id: "c1",
    guildId: "g1",
    messagesFetchResult: new Map(
      (opts.channelMessages ?? []).map((m) => [m.id, m]),
    ),
  });
  const guild = createMockGuild({ id: "g1", channels: new Map([["c1", channel]]) });
  const msg = createMockMessage({
    id: "report1",
    content: `<@&${mentionedRoleId}>`,
    guildId: "g1",
    channelId: "c1",
    author: { id: "reporter", bot: opts.authorBot ?? false },
  });
  (msg as unknown as { guild: unknown }).guild = guild;
  (msg as unknown as { mentions: { roles: Map<string, unknown> } }).mentions = {
    roles: new Map([[mentionedRoleId, { id: mentionedRoleId }]]),
  };
  (msg as unknown as { reference: null }).reference = null;
  return msg;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/features/ai-mod/mod-mention.handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mod-mention handler**

`src/features/ai-mod/handlers/mod-mention.handler.ts`:
```ts
import type { Message, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { env } from "@/config/env";
import { logger } from "@/core/logger";
import { safeDelete, safeTimeout, extractImageUrls } from "@/core/discord/moderation";
import { LogChannelService } from "@/features/log-channel";
import { LanguageService } from "@/features/language";
import { getTranslation } from "@/i18n";
import { extractPuffContent } from "@/features/puff";
import { ImageService, ImageHashService } from "@/features/images";

import { AiModConfigService } from "../services/ai-mod-config.service";
import { ModRoleService } from "../services/mod-role.service";
import { SelfpromoBypassService } from "../services/selfpromo-bypass.service";
import { NotifyTargetsService } from "../services/notify-targets.service";
import { ContextBuilderService } from "../services/context-builder.service";
import { classifyBatch, type ClassifyEntry } from "../services/classifier.service";
import { ImageDuplicateService } from "../services/image-duplicate.service";
import { CasesService } from "../services/cases.service";
import {
  buildFlaggedEmbed,
  buildPrecautionEmbed,
  buildPingString,
} from "../services/alert-builder.service";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ACTION_THRESHOLD = 0.8;
const ALERT_THRESHOLD = 0.5;
const CANDIDATE_LIMIT = 10;
const BYPASS_PLATFORMS = new Set([1, 2, 3]);

interface FlaggedCandidate {
  message: Message;
  verdict: 1 | 2;
  confidence: number;
  platform: number;
  reason: string;
  fromImage: boolean;
}

export async function handleModMention(message: Message): Promise<void> {
  let guildId: string | undefined;
  try {
    if (!message.guild) return;
    guildId = message.guild.id;
    if (message.author.bot) return;

    if (!env.AI_API_URL || !env.AI_API_KEY) {
      logger.warn("ai-mod: AI env missing, feature disabled");
      return;
    }

    const enabled = await AiModConfigService.isEnabled(guildId);
    if (!enabled) return;

    // Mod-role trigger: any mentioned role registered as a mod role.
    const mentionedRoleIds = [...message.mentions.roles.keys()];
    if (mentionedRoleIds.length === 0) return;
    const isModMention = await Promise.all(
      mentionedRoleIds.map((rid) => ModRoleService.hasRole(guildId, rid)),
    );
    if (!isModMention.some(Boolean)) return;

    const lang = await LanguageService.getLanguage(guildId);
    const t = getTranslation(lang);

    const candidates = await resolveCandidates(message);
    if (candidates.length === 0) return;

    const textCandidates: { index: number; content: string; message: Message }[] = [];
    const imageCandidates: Message[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const m = candidates[i];
      const content = extractPuffContent(m);
      if (!content) continue;
      if (content.kind === "image") {
        imageCandidates.push(m);
      } else if (content.kind === "text" && content.text) {
        textCandidates.push({ index: textCandidates.length, content: content.text, message: m });
      }
    }

    const flagged: FlaggedCandidate[] = [];
    const precautionCandidates: { url: string; authorTag: string }[] = [];

    // Text route: one AI call.
    if (textCandidates.length > 0) {
      const context = await ContextBuilderService.buildContext(guildId);
      const result = await classifyBatch(
        guildId,
        textCandidates.map((c) => ({ index: c.index, content: c.content })),
        lang,
        context,
      );
      if (!result.ok) {
        // AI failure → all text candidates go to precaution.
        for (const c of textCandidates) {
          precautionCandidates.push({ url: c.message.url, authorTag: c.message.author.tag });
        }
      } else {
        for (const entry of result.entries) {
          if (entry.v === 0) continue;
          if (entry.c < ALERT_THRESHOLD) continue;
          const matched = textCandidates.find((c) => c.index === entry.index);
          if (!matched) continue;
          flagged.push({
            message: matched.message,
            verdict: entry.v as 1 | 2,
            confidence: entry.c,
            platform: entry.p,
            reason: entry.r,
            fromImage: false,
          });
        }
      }
    }

    // Image route: cross-channel duplicate scan.
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
        });
      } else {
        // Not analyzable → precaution.
        precautionCandidates.push({ url: imgMsg.url, authorTag: imgMsg.author.tag });
      }
    }

    // Apply bypass + confidence bands + actions.
    const actionable: FlaggedCandidate[] = [];
    for (const f of flagged) {
      if (f.verdict === 2 && BYPASS_PLATFORMS.has(f.platform)) {
        const inBypass = await SelfpromoBypassService.isBypass(guildId, f.message.channelId);
        if (inBypass) continue; // allowed self-promo: no log, no action
      }
      if (f.confidence < ACTION_THRESHOLD) {
        // Borderline: alert-only, no case row, no buttons (added to precaution list below).
        precautionCandidates.push({ url: f.message.url, authorTag: f.message.author.tag });
        continue;
      }
      actionable.push(f);
    }

    // Act on each actionable candidate.
    const caseInserts: Promise<number>[] = [];
    for (const f of actionable) {
      let actionLabel = t.aiMod.action_timeout;
      try {
        const member = await message.guild.members.fetch(f.message.author.id).catch(() => null);
        if (member) {
          if (member.isCommunicationDisabled()) {
            actionLabel = t.aiMod.action_already_timeout;
          } else {
            const ok = await safeTimeout(member, ONE_DAY_MS, `ai-mod: ${f.reason}`);
            if (!ok) actionLabel = t.aiMod.action_no_permission;
          }
        }
      } catch (e) {
        logger.warn(`ai-mod: timeout attempt failed: ${e}`);
        actionLabel = t.aiMod.action_no_permission;
      }
      await safeDelete(f.message);

      // Persist a new scam image so monitorImages catches it next time.
      if (f.fromImage) {
        await persistScamImage(guildId, f.message);
      }

      const caseId = await CasesService.insert({
        guildId,
        authorId: f.message.author.id,
        channelId: f.message.channelId,
        messageId: f.message.id,
        content: f.message.content || "(image)",
        verdict: f.verdict,
        confidence: f.confidence,
        platform: f.platform,
        reason: f.reason,
        actionTaken: actionLabel,
      });
      caseInserts.push(Promise.resolve(caseId));

      await sendFlaggedAlert(message, guildId, lang, t, f, actionLabel, caseId);
    }

    // Precaution alert (inconclusive + borderline), only if any.
    if (precautionCandidates.length > 0 && actionable.length === 0) {
      await sendPrecautionAlert(message, guildId, lang, t, precautionCandidates);
    }

    await Promise.all(caseInserts);
  } catch (e) {
    logger.error(`ai-mod: handleModMention error: ${e}`);
  }
}

async function resolveCandidates(message: Message): Promise<Message[]> {
  // Reply branch: the single replied message.
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      return [ref];
    } catch (e) {
      logger.warn(`ai-mod: reply fetch failed, falling back to last-10: ${e}`);
    }
  }
  // No-reply branch: last 10, minus reporter and bots.
  try {
    const fetched = await message.channel.messages.fetch({ limit: CANDIDATE_LIMIT });
    const out: Message[] = [];
    for (const [, m] of fetched) {
      if (m.id === message.id) continue;
      if (m.author.id === message.author.id) continue;
      if (m.author.bot) continue;
      out.push(m);
    }
    return out;
  } catch (e) {
    logger.warn(`ai-mod: failed to fetch candidates: ${e}`);
    return [];
  }
}

async function persistScamImage(guildId: string, message: Message): Promise<void> {
  const urls: string[] = [];
  for (const att of message.attachments.values()) {
    if (att.contentType?.startsWith("image/")) urls.push(att.url);
  }
  urls.push(...extractImageUrls(message.content));
  for (let i = 0; i < urls.length; i++) {
    try {
      const fp = await ImageHashService.downloadFingerprint(urls[i]);
      if (!fp) continue;
      await ImageService.addImage(guildId, `aimod-${message.id}-${i}`, urls[i]);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (!reason.includes("already exists")) {
        logger.warn(`ai-mod: failed to persist scam image: ${reason}`);
      }
    }
  }
}

async function sendFlaggedAlert(
  trigger: Message,
  guildId: string,
  lang: "es" | "en",
  t: ReturnType<typeof getTranslation>,
  f: FlaggedCandidate,
  actionLabel: string,
  caseId: number,
): Promise<void> {
  const logChannelId = await LogChannelService.getLogChannel(guildId);
  if (!logChannelId) {
    logger.warn(`ai-mod: flagged case ${caseId} but no log channel`);
    return;
  }
  const channel = await trigger.guild?.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const targets = await NotifyTargetsService.list(guildId);
  const ping = buildPingString(targets);
  const { embed, components } = buildFlaggedEmbed(
    {
      caseId,
      authorTag: f.message.author.tag,
      authorId: f.message.author.id,
      channelId: f.message.channelId,
      confidence: f.confidence,
      platform: f.platform,
      verdict: f.verdict,
      reason: f.reason,
      actionLabel,
    },
    t,
  );
  await (channel as TextChannel).send({ content: ping || undefined, embeds: [embed], components });
  void lang;
}

async function sendPrecautionAlert(
  trigger: Message,
  guildId: string,
  _lang: "es" | "en",
  t: ReturnType<typeof getTranslation>,
  candidates: { url: string; authorTag: string }[],
): Promise<void> {
  const logChannelId = await LogChannelService.getLogChannel(guildId);
  if (!logChannelId) {
    logger.warn("ai-mod: precaution needed but no log channel");
    return;
  }
  const channel = await trigger.guild?.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const targets = await NotifyTargetsService.list(guildId);
  const ping = buildPingString(targets);
  const embed = buildPrecautionEmbed(candidates, t);
  await (channel as TextChannel).send({ content: ping || undefined, embeds: [embed] });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/unit/features/ai-mod/mod-mention.handler.test.ts`
Expected: PASS (7 tests). If a test fails because the mock message's `url` or `author.tag` is undefined, the precaution branch only runs when there are inconclusive candidates — adjust the test fixtures to add `url`/`tag` where needed, or rely on the handler's tolerance (it reads `m.url`/`m.author.tag` which the mock provides via `createMockUser` defaults).

- [ ] **Step 5: Export from the barrel**

Append to `src/features/ai-mod/index.ts`:
```ts
export { handleModMention } from "./handlers/mod-mention.handler";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-mod/handlers/mod-mention.handler.ts \
        src/features/ai-mod/index.ts \
        tests/unit/features/ai-mod/mod-mention.handler.test.ts
git commit -m "feat(ai-mod): add mod-mention orchestration handler"
```

---

### Task 6: Event wiring (message-create + interaction-create)

Wire `handleModMention` into the message-create guild block and route `aimod_` buttons to `handleFeedbackButton` in interaction-create. Add a smoke test that the wiring imports resolve and the guild block calls the handler.

**Files:**
- Modify: `src/events/message-create.ts`
- Modify: `src/events/interaction-create.ts`
- Test: `tests/unit/events/message-create.test.ts` (extend if it exists; otherwise create a focused wiring test)

**Interfaces:**
- Consumes: `handleModMention` from `@/features/ai-mod`, `handleFeedbackButton` from `@/features/ai-mod`.

- [ ] **Step 1: Wire handleModMention into message-create**

In `src/events/message-create.ts`, add the import alongside the other feature imports:
```ts
import { handleModMention } from "@/features/ai-mod";
```
In the `if (message.guild)` block, add the call. The block currently is:
```ts
  if (message.guild) {
    await enforceUniqueChannel(message);
    await enforceLinkCooldown(message);
    await applyLineFilter(message, client);
    await enforceJobGuard(message);

    if (message.attachments.size > 0 || containsImageUrl(message.content)) {
      await monitorImages(message);
    }
  }
```
Insert `await handleModMention(message);` after `await enforceJobGuard(message);` and before the image-monitoring `if`:
```ts
  if (message.guild) {
    await enforceUniqueChannel(message);
    await enforceLinkCooldown(message);
    await applyLineFilter(message, client);
    await enforceJobGuard(message);
    await handleModMention(message);

    if (message.attachments.size > 0 || containsImageUrl(message.content)) {
      await monitorImages(message);
    }
  }
```

- [ ] **Step 2: Wire handleFeedbackButton into interaction-create**

In `src/events/interaction-create.ts`, add the import:
```ts
import { handleFeedbackButton } from "@/features/ai-mod";
```
In the `if (interaction.isButton())` block, add a branch **before** the `images_` branch (so `aimod_` is matched first), with an early return:
```ts
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("aimod_")) {
        await handleFeedbackButton(interaction);
        return;
      }
      if (interaction.customId.startsWith("images_")) {
        await handleImagesButtonInteraction(interaction);
        return;
      }
```

- [ ] **Step 3: Run the existing message-create test to check for regressions**

Run: `bun test --isolate tests/unit/events/message-create.test.ts tests/unit/events.test.ts 2>&1 | tail -10`
Expected: PASS (the existing event tests mock the enforce handlers; `handleModMention` must not throw on a non-mod-mention message — it returns early at the mod-role check). If a test fails because `handleModMention` is not mocked and hits the real DB/AI, add a `mock.module("@/features/ai-mod", () => ({ handleModMention: async () => {} }))` to the affected test file(s), matching how those tests mock the other enforce handlers.

- [ ] **Step 4: Run the full suite**

Run: `bun test --isolate`
Expected: PASS — all ai-mod tests + baseline; the only failure remains the pre-existing `handleHistoryCommand`.

- [ ] **Step 5: Commit**

```bash
git add src/events/message-create.ts src/events/interaction-create.ts tests/unit/events/message-create.test.ts
git commit -m "feat(ai-mod): wire handleModMention and feedback button into events"
```

---

## End of Plan 2

After Task 6 the ai-mod feature is end-to-end functional: admins configure mod roles / notify targets / bypass channels / ignored channels / toggle with the five commands; a `@mod` mention triggers AI + image-duplicate analysis; offenders get 24h timeouts; mods get alerted with Correct/Incorrect buttons; feedback learns from mistakes; the log channel + notify targets are pinged.

## Self-Review (Plan 2)

- **Spec coverage:**
  - i18n (es/en, `t.aiMod.*`) → Task 1 ✓
  - Alert embeds + buttons + ping string → Task 2 ✓
  - 5 commands + registry → Task 3 ✓
  - Feedback button (correct/incorrect, AI 2nd call, `timeout(null)` removal, dedup) → Task 4 ✓
  - `handleModMention` (candidates, routing, bypass, confidence bands, timeout-skip, image persistence, alerts, case rows) → Task 5 ✓
  - Event wiring (message-create guild block, interaction-create button routing) → Task 6 ✓
- **Placeholders:** none — every step has complete code or exact commands.
- **Type consistency:** `FlaggedEmbedInput` defined in Task 2, consumed in Task 5 with matching field names. `ClassifyEntry` (from Plan 1) fields `v/c/r/p/index` match Task 5's usage. `CasesService.insert` payload (Plan 1's `CaseInsertPayload`) matches Task 5's call. `handleFeedbackButton` customId parsing `aimod_<id>_<action>` matches `buildFlaggedEmbed`'s customId generation in Task 2.
- **discord.js API accuracy:** `message.reference.messageId` (verified), `member.timeout(null, reason)` for removal (verified per v14.26 docs — supersedes the spec's `timeout(0)`), `member.isCommunicationDisabled()` (v14 standard), `message.mentions.roles.keys()` (Collection). `PermissionFlagsBits.ManageGuild` / `ManageMessages` used for permission gates.
- **Help catalog:** NOT included — the spec did not require help entries, and `src/commands/help/catalog.ts` is a separate hardcoded catalog. Adding entries there is a follow-up polish task (low risk, no functional impact). Flagged here so it is not forgotten.
- **Known follow-ups:** (1) help catalog entries for the 5 commands; (2) the `mod-mention.handler` test mocks `extractPuffContent` with a simplified shape — if the real `extractPuffContent` returns a richer object, the handler only reads `kind`/`imageUrls`/`text`, so the simplification is safe.
