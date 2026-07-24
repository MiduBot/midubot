import { describe, it, expect, mock, afterEach } from "bun:test";
import {
  parseBatch,
  buildSystemPrompt,
  buildUserPrompt,
  classifyBatch,
} from "@/features/ai-mod/services/classifier.service";

mock.module("@/config/env", () => ({
  env: {
    AI_API_URL: "https://ai.test/v1/chat/completions",
    AI_API_KEY: "test-key",
    AI_MODEL: "deepseek-v4-flash",
  },
}));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("parseBatch", () => {
  it("parses a valid multi-entry payload", () => {
    const r = parseBatch(
      '{"messages":[{"index":0,"v":1,"c":0.9,"r":"estafa"},{"index":1,"v":2,"c":0.8,"r":"selfpromo","p":4}]}',
    );
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].v).toBe(1);
    expect(r.entries[1].p).toBe(4);
  });

  it("strips ```json fences", () => {
    const r = parseBatch('```json\n{"messages":[{"index":0,"v":0,"c":0.1,"r":"ok"}]}\n```');
    expect(r.ok).toBe(true);
    expect(r.entries[0].v).toBe(0);
  });

  it("returns ok:false when messages is missing", () => {
    expect(parseBatch('{"foo":1}').ok).toBe(false);
  });

  it("returns ok:false on malformed JSON", () => {
    expect(parseBatch("not json").ok).toBe(false);
  });

  it("drops entries with invalid v but keeps valid ones", () => {
    const r = parseBatch(
      '{"messages":[{"index":0,"v":9,"c":0.9,"r":"x"},{"index":1,"v":1,"c":0.8,"r":"y"}]}',
    );
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].index).toBe(1);
  });

  it("drops entries with out-of-range confidence", () => {
    const r = parseBatch(
      '{"messages":[{"index":0,"v":1,"c":2,"r":"x"}]}',
    );
    expect(r.entries).toHaveLength(0);
  });

  it("defaults p to 0 when omitted", () => {
    const r = parseBatch('{"messages":[{"index":0,"v":1,"c":0.9,"r":"x"}]}');
    expect(r.entries[0].p).toBe(0);
  });
});

describe("buildSystemPrompt", () => {
  it("includes the lang instruction and context blocks", () => {
    const p = buildSystemPrompt("es", "[ejemplo]", "[nota]");
    expect(p).toContain("español");
    expect(p).toContain("[ejemplo]");
    expect(p).toContain("[nota]");
  });
});

describe("buildUserPrompt", () => {
  it("wraps each candidate in mensaje tags with its index", () => {
    const u = buildUserPrompt([
      { index: 0, content: "hola" },
      { index: 1, content: "mundo" },
    ]);
    expect(u).toContain('<mensaje index="0">');
    expect(u).toContain("hola");
    expect(u).toContain('<mensaje index="1">');
    expect(u).toContain("mundo");
  });
});

describe("classifyBatch", () => {
  it("returns parsed entries on a good AI response", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"messages":[{"index":0,"v":1,"c":0.95,"r":"estafa cripto"}]}' } },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const r = await classifyBatch(
      "g1",
      [{ index: 0, content: "send me a DM" }],
      "es",
      { examples: "", prompts: "" },
    );
    expect(r.ok).toBe(true);
    expect(r.entries[0].v).toBe(1);
  });

  it("returns ok:false when AI returns null (HTTP 500)", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const r = await classifyBatch("g1", [{ index: 0, content: "x" }], "es", { examples: "", prompts: "" });
    expect(r.ok).toBe(false);
  });
});
