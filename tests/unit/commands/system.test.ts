import { describe, it, expect } from "bun:test";
import { handleVersionCommand } from "@/features/system/commands/version.command";
import { createMockMessage } from "../../mocks/discord";

describe("handleVersionCommand", () => {
  it("replies with version info", async () => {
    const msg = createMockMessage();
    await handleVersionCommand(msg);
    expect(msg.reply).toHaveBeenCalled();
  });
});
