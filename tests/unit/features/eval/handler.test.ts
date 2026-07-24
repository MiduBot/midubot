import { describe, it, expect, mock } from "bun:test";
import { extractCode, redactSecrets, chunkForDiscord, wrapCodeBlock } from "@/features/eval/handlers/eval.handler";
import { handleEvalCommand } from "@/features/eval/handlers/eval.handler";
import { createMockMessage } from "../../../mocks/discord";
import { getCommand } from "@/commands/registry";

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

describe("eval command registration", () => {
  it("is registered under name 'eval' and alias 'ev'", () => {
    expect(getCommand("eval")?.name).toBe("eval");
    expect(getCommand("ev")?.name).toBe("eval");
  });
});
