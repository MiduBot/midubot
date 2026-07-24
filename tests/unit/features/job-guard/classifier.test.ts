import { describe, it, expect, mock, afterEach } from "bun:test";
import { parseVerdict, classify } from "@/features/job-guard/services/classifier.service";

describe("parseVerdict", () => {
  it("parses a valid block verdict", () => {
    const r = parseVerdict('{"verdict":"block","confidence":0.9,"reason":"oferta"}');
    expect(r).toEqual({ ok: true, verdict: "block", confidence: 0.9, reason: "oferta" });
  });

  it("parses a valid allow verdict", () => {
    const r = parseVerdict('{"verdict":"allow","confidence":0.2,"reason":"autopromo"}');
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe("allow");
  });

  it("strips ```json code fences", () => {
    const r = parseVerdict('```json\n{"verdict":"block","confidence":0.8,"reason":"x"}\n```');
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe("block");
  });

  it("rejects malformed JSON", () => {
    expect(parseVerdict("not json").ok).toBe(false);
  });

  it("rejects an unknown verdict value", () => {
    expect(parseVerdict('{"verdict":"maybe","confidence":0.5}').ok).toBe(false);
  });

  it("rejects out-of-range confidence", () => {
    expect(parseVerdict('{"verdict":"block","confidence":2}').ok).toBe(false);
  });

  it("rejects non-number confidence", () => {
    expect(parseVerdict('{"verdict":"block","confidence":"high"}').ok).toBe(false);
  });

  it("rejects null JSON", () => {
    expect(parseVerdict("null").ok).toBe(false);
  });

  it("rejects number JSON", () => {
    expect(parseVerdict("123").ok).toBe(false);
  });

  it("rejects array JSON", () => {
    expect(parseVerdict("[]").ok).toBe(false);
  });
});

mock.module("@/config/env", () => ({
  env: {
    AI_API_URL: "https://ai.test/v1/chat/completions",
    AI_API_KEY: "test-key",
    AI_MODEL: "deepseek-v4-flash",
    JOB_CHANNEL_ID: "chan-1",
  },
}));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetchOnce(impl: () => Promise<Response>) {
  globalThis.fetch = mock(impl) as unknown as typeof fetch;
}

describe("classify", () => {
  it("returns the parsed verdict on a good response", async () => {
    mockFetchOnce(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"verdict":"block","confidence":0.95,"reason":"oferta"}' } },
          ],
        }),
        { status: 200 },
      ),
    );
    const r = await classify("se busca dev, pago por proyecto");
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe("block");
    expect(r.confidence).toBe(0.95);
  });

  it("returns ok:false on a non-200 response", async () => {
    mockFetchOnce(async () => new Response("nope", { status: 500 }));
    const r = await classify("hola");
    expect(r.ok).toBe(false);
  });

  it("returns ok:false when fetch throws", async () => {
    mockFetchOnce(async () => {
      throw new Error("network down");
    });
    const r = await classify("hola");
    expect(r.ok).toBe(false);
  });
});
