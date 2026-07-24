import { describe, it, expect, beforeEach, mock } from "bun:test";
import { getTranslation, type Language, type Translations } from "@/i18n";
import { en } from "@/i18n/en";
import { es } from "@/i18n/es";

function collectKeys(obj: unknown, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe("i18n", () => {
  it("returns en and es translations", () => {
    const langs: Language[] = ["en", "es"];
    for (const l of langs) {
      const t = getTranslation(l);
      expect(t.commands.unknown).toBeTruthy();
    }
  });

  it("has identical key structure in en and es", () => {
    const enKeys = collectKeys(en).sort();
    const esKeys = collectKeys(es).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it("has no empty translation values", () => {
    const seen = new Set<string>();
    function walk(t: Translations, prefix = "") {
      for (const [k, v] of Object.entries(t)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") {
          walk(v as Translations, path);
        } else {
          expect(`${path}=${v}`).not.toBe(`${path}=`);
          seen.add(path);
        }
      }
    }
    walk(en);
    walk(es);
    expect(seen.size).toBeGreaterThan(0);
  });
});
