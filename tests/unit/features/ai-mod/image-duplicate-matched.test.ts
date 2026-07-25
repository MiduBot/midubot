import { describe, it, expect, mock } from "bun:test";
import type { Guild, Message } from "discord.js";

mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: async () => false,
}));

mock.module("@/features/images", () => ({
  ImageHashService: {
    downloadFingerprint: mock(async (url: string) =>
      url.includes("imgA") ? { dhash: "DHASH_A" } : null,
    ),
  },
}));

import { ImageDuplicateService } from "@/features/ai-mod/services/image-duplicate.service";

function makeMessage(
  id: string,
  authorId: string,
  url: string,
  channelId: string,
): Message {
  return {
    id,
    channelId,
    author: { id: authorId, bot: false } as never,
    content: "",
    attachments: new Map([["a", { url, contentType: "image/png" }]]) as never,
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
    channels: { cache: channels, fetch: async () => new Map(channels) },
  } as unknown as Guild;
}

describe("ImageDuplicateService.checkImage — matchedMessages", () => {
  it("includes same-author matches even when not yet flagged (<3 channels)", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const other = makeMessage("m1", "spammer", "https://x/imgA.png", "c2");
    const guild = makeGuild({ c1: [candidate], c2: [other] });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.channelCount).toBe(2);
    expect(r.matchedMessages).toHaveLength(1);
    expect(r.matchedMessages[0].id).toBe("m1");
  });

  it("flags and includes matches when same author hits ≥3 channels", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const m1 = makeMessage("m1", "spammer", "https://x/imgA.png", "c2");
    const m2 = makeMessage("m2", "spammer", "https://x/imgA.png", "c3");
    const guild = makeGuild({ c1: [candidate], c2: [m1], c3: [m2] });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(true);
    expect(r.matchedMessages).toHaveLength(2);
  });

  it("returns empty matchedMessages when only the candidate has the image", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const guild = makeGuild({ c1: [candidate] });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.matchedMessages).toEqual([]);
  });

  it("excludes matches from different authors", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const guild = makeGuild({
      c1: [candidate],
      c2: [makeMessage("m1", "other", "https://x/imgA.png", "c2")],
    });
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(false);
    expect(r.matchedMessages).toEqual([]);
  });

  it("caps matchedMessages at 100 even with more matches", async () => {
    const candidate = makeMessage("m0", "spammer", "https://x/imgA.png", "c1");
    const others: Message[] = [];
    for (let i = 1; i <= 150; i++) {
      others.push(makeMessage(`m${i}`, "spammer", "https://x/imgA.png", `c${i + 1}`));
    }
    const channels: Record<string, Message[]> = { c1: [candidate] };
    for (let i = 0; i < 150; i++) {
      channels[`c${i + 2}`] = [others[i]];
    }
    const guild = makeGuild(channels);
    const r = await ImageDuplicateService.checkImage(guild as never, candidate);
    expect(r.flagged).toBe(true);
    expect(r.matchedMessages).toHaveLength(100);
  });
});
