import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createMockMessage, createMockTextChannel } from "../../../mocks/discord";

const isIgnoredMock = mock(async () => false);
mock.module("@/core/discord/ignored-channels", () => ({
  isIgnored: isIgnoredMock,
}));

mock.module("@/features/puff", () => ({
  extractPuffContent: (message: { content: string; attachments: { size: number } }) =>
    message.attachments.size > 0
      ? { kind: "image", imageUrls: ["https://example.test/image.png"] }
      : { kind: "text", text: message.content },
}));

import { collectReportEvidence } from "@/features/ai-mod/services/report-evidence.service";

beforeEach(() => {
  isIgnoredMock.mockClear();
  isIgnoredMock.mockImplementation(async () => false);
});

describe("collectReportEvidence", () => {
  it("returns only referenced message for reply reports", async () => {
    const referenced = createMockMessage({
      id: "target-1",
      content: "contenido reportado",
      channelId: "channel-1",
      attachments: [{ url: "https://example.test/file.png", contentType: "image/png" }],
    });
    const channel = createMockTextChannel({
      id: "channel-1",
      guildId: "g1",
      messagesFetchResult: async (value: unknown) => value === "target-1" ? referenced : new Map(),
    });
    const report = createMockMessage({ id: "report-1", content: "revisen esto", channelId: "channel-1" });
    report.channel = channel as never;
    report.reference = { messageId: "target-1" } as never;

    const result = await collectReportEvidence(report);

    expect(result.selection).toBe("fixed");
    expect(result.reportContent).toBe("revisen esto");
    expect(result.candidates).toEqual([
      {
        index: 0,
        messageId: "target-1",
        authorId: referenced.author.id,
        channelId: "channel-1",
        content: "contenido reportado",
        attachments: [{
          url: "https://example.test/file.png",
          name: "https://example.test/file.png",
          contentType: "image/png",
        }],
      },
    ]);
    expect(result.messagesByIndex.get(0)).toBe(referenced);
  });

  it("filters reporter, bots, and staff from recent candidates", async () => {
    const reporter = createMockMessage({ id: "reporter", content: "own post", author: { id: "reporter" } });
    const bot = createMockMessage({ id: "bot", content: "bot post", author: { id: "bot", bot: true } });
    const staff = createMockMessage({ id: "staff", content: "staff post", manageMessages: true });
    const target = createMockMessage({ id: "target", content: "candidate" });
    const channel = createMockTextChannel({
      id: "channel-1",
      guildId: "g1",
      messagesFetchResult: new Map([
        [reporter.id, reporter],
        [bot.id, bot],
        [staff.id, staff],
        [target.id, target],
      ]),
    });
    const report = createMockMessage({ id: "report-1", author: { id: "reporter" }, channelId: "channel-1" });
    report.channel = channel as never;
    report.reference = null;

    const result = await collectReportEvidence(report);

    expect(result.selection).toBe("model");
    expect(result.candidates.map(({ messageId }) => messageId)).toEqual(["target"]);
  });

  it("checks ignored channel before fetching messages", async () => {
    isIgnoredMock.mockImplementation(async () => true);
    const fetchMock = mock(async () => new Map());
    const report = createMockMessage({ id: "report-1" });
    report.channel = createMockTextChannel({ messagesFetchResult: fetchMock }) as never;

    const result = await collectReportEvidence(report);

    expect(result.candidates).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no candidates when candidate fetch fails", async () => {
    const report = createMockMessage({ id: "report-1" });
    report.channel = createMockTextChannel({
      messagesFetchResult: async () => {
        throw new Error("Discord unavailable");
      },
    }) as never;

    const result = await collectReportEvidence(report);

    expect(result.candidates).toEqual([]);
  });
});
