import { describe, expect, it } from "bun:test";
import {
  prepareEvidenceFiles,
} from "@/features/ai-moderation/services/evidence-files.service";

function image(name: string, size = 4): { url: string; name: string; contentType: string } {
  return {
    url: `https://cdn.test/${name}`,
    name,
    contentType: "image/png",
  };
}

describe("prepareEvidenceFiles", () => {
  it("copies only first two successful image attachments", async () => {
    const calls: string[] = [];
    const files = await prepareEvidenceFiles(
      [image("one.png"), image("two.png"), image("three.png"), {
        url: "https://cdn.test/file.txt",
        name: "file.txt",
        contentType: "text/plain",
      }],
      async (input) => {
        calls.push(String(input));
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      },
    );

    expect(calls).toEqual([
      "https://cdn.test/one.png",
      "https://cdn.test/two.png",
    ]);
    expect(files.map((file) => file.name)).toEqual(["one.png", "two.png"]);
    expect(files[0]?.attachment).toEqual(Buffer.from([1, 2, 3]));
  });

  it("skips non-2xx responses and files that exceed the combined 8 MiB limit", async () => {
    const calls: string[] = [];
    const files = await prepareEvidenceFiles(
      [image("large.png"), image("over-limit.png"), image("never.png")],
      async (input) => {
        calls.push(String(input));
        if (String(input).endsWith("large.png")) {
          return new Response(new Uint8Array(7 * 1024 * 1024), { status: 200 });
        }
        return new Response(new Uint8Array(2 * 1024 * 1024), { status: 200 });
      },
    );

    expect(calls).toEqual([
      "https://cdn.test/large.png",
      "https://cdn.test/over-limit.png",
    ]);
    expect(files.map((file) => file.name)).toEqual(["large.png"]);
  });

  it("does not fail the moderation flow when download rejects", async () => {
    const files = await prepareEvidenceFiles(
      [image("broken.png")],
      async () => {
        throw new Error("network down");
      },
    );

    expect(files).toEqual([]);
  });
});
