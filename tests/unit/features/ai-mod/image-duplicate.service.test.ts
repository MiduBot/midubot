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
  channelId: string,
): Message {
  return {
    id,
    channelId,
    author: { id: authorId, bot: false } as never,
    content: "",
    attachments: new Map([["a", { url: imageUrl, contentType: "image/png" }]]) as never,
    channel: { id: channelId } as never,
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
  it("flags when the same author has the image in ≥3 channels", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const guild = makeGuild({
      c1: [candidate],
      c2: [makeMessage("m1", "spammer", "https://x/imgA.png", "c2")],
      c3: [makeMessage("m2", "spammer", "https://x/imgA.png", "c3")],
    });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(true);
    expect(r.channelCount).toBe(3);
    expect(r.matchedMessages.length).toBe(2);
  });

  it("does NOT flag with only 2 channels (same author)", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const guild = makeGuild({
      c1: [candidate],
      c2: [makeMessage("m1", "spammer", "https://x/imgA.png", "c2")],
    });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.channelCount).toBe(2);
  });

  it("does NOT flag when duplicates are from different authors", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const guild = makeGuild({
      c1: [candidate],
      c2: [makeMessage("m1", "otheruser", "https://x/imgA.png", "c2")],
      c3: [makeMessage("m2", "otheruser2", "https://x/imgA.png", "c3")],
    });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.channelCount).toBe(1);
  });

  it("does NOT flag when only the candidate has the image", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const guild = makeGuild({ c1: [candidate] });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.channelCount).toBe(1);
  });
});
