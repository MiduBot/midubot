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
    const confField = (data.fields ?? []).find((f) => f.name === t.aiMod.field_confidence);
    expect(confField?.value).toContain(t.aiMod.confidence_high);
    expect(components).toHaveLength(1);
    expect(components[0].components).toHaveLength(2);
    const customIds = components[0].components.map((b) =>
      (b as unknown as { data: { custom_id: string } }).data.custom_id,
    );
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
    const { embed, components } = buildPrecautionEmbed(
      [{ url: "https://discord.com/channels/g/c/m1", authorTag: "user#0001", caseId: 7 }],
      t,
    );
    const data = embed.toJSON();
    expect(data.title).toContain("no concluyente");
    expect(data.description).toContain("m1");
    expect(data.description).toContain("user#0001");
    expect(components).toHaveLength(1);
    expect(components[0].components).toHaveLength(2);
    const customIds = components[0].components.map((b) =>
      (b as unknown as { data: { custom_id: string } }).data.custom_id,
    );
    expect(customIds).toContain("aimod_7_correct");
    expect(customIds).toContain("aimod_7_incorrect");
  });

  it("numbers buttons and candidates when there are multiple candidates", () => {
    const { embed, components } = buildPrecautionEmbed(
      [
        { url: "https://discord.com/channels/g/c/m1", authorTag: "a#1", caseId: 1 },
        { url: "https://discord.com/channels/g/c/m2", authorTag: "b#2", caseId: 2 },
      ],
      t,
    );
    const data = embed.toJSON();
    expect(data.description).toContain("1. [msg]");
    expect(data.description).toContain("2. [msg]");
    expect(components).toHaveLength(1);
    expect(components[0].components).toHaveLength(4);
    const labels = components[0].components.map((b) =>
      (b as unknown as { data: { label: string } }).data.label,
    );
    expect(labels.some((l) => l.includes("1"))).toBe(true);
    expect(labels.some((l) => l.includes("2"))).toBe(true);
  });
});
