import { describe, it, expect, mock } from "bun:test";
import type { Guild, Message } from "discord.js";

// Mock isIgnored to keep this test independent of Task 7.
mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: async () => false,
}));

// Mock ImageHashService.downloadFingerprint: same dhash for "imgA", different for "imgB".
mock.module("@/features/images", () => ({
  ImageHashService: {
    downloadFingerprint: mock(async (url: string) =>
      url.includes("imgA")
        ? { dhash: "DHASH_A" }
        : url.includes("imgB")
          ? { dhash: "DHASH_B" }
          : null,
    ),
  },
}));

import { ImageDuplicateService } from "@/features/ai-mod/services/image-duplicate.service";

function makeMessage(
  id: string,
  authorId: string,
  imageUrl: string,
): Message {
  return {
    id,
    author: { id: authorId, bot: false } as never,
    content: "",
    attachments: new Map([["a", { url: imageUrl, contentType: "image/png" }]]) as never,
    channel: { id: "c1" } as never,
  } as unknown as Message;
}

function makeGuild(messagesByChannel: Record<string, Message[]>): Guild {
  const channels = new Map();
  for (const [cid, msgs] of Object.entries(messagesByChannel)) {
    const map = new Map(msgs.map((m) => [m.id, m]));
    channels.set(cid, {
      id: cid,
      type: 0,
      viewable: true,
      messages: { fetch: async () => map },
    });
  }
  return {
    id: "g1",
    channels: {
      cache: channels,
      fetch: async () => new Map(channels),
    },
  } as unknown as Guild;
}

describe("ImageDuplicateService.checkImage", () => {
  it("flags when the same author reposts the same image across channels", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png");
    const guild = makeGuild({
      c1: [candidate],
      c2: [makeMessage("m1", "spammer", "https://x/imgA.png")],
    });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(true);
  });

  it("does NOT flag when duplicates are from different authors", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png");
    const guild = makeGuild({
      c1: [candidate],
      c2: [makeMessage("m1", "otheruser", "https://x/imgA.png")],
    });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
  });

  it("does NOT flag when only the candidate has the image", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png");
    const guild = makeGuild({ c1: [candidate] });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
  });
});
