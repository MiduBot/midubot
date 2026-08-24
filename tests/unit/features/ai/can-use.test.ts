import { describe, it, expect } from "bun:test";
import {
  canUseAiChat,
  type CanUseAiChatInput,
} from "@/features/ai/services/ai-chat-allow";

function input(overrides: Partial<CanUseAiChatInput> = {}): CanUseAiChatInput {
  return {
    entries: [],
    authorId: "u1",
    isSuperdev: false,
    isMod: false,
    hasRole: () => false,
    ...overrides,
  };
}

describe("canUseAiChat", () => {
  it("allows everyone when the list is empty", () => {
    expect(canUseAiChat(input())).toBe(true);
  });

  it("always allows superdevs", () => {
    expect(
      canUseAiChat(
        input({
          isSuperdev: true,
          entries: [{ type: "role", entityId: "staff" }],
        }),
      ),
    ).toBe(true);
  });

  it("allows a listed member", () => {
    expect(
      canUseAiChat(
        input({
          entries: [{ type: "member", entityId: "u1" }],
        }),
      ),
    ).toBe(true);
    expect(
      canUseAiChat(
        input({
          authorId: "u2",
          entries: [{ type: "member", entityId: "u1" }],
        }),
      ),
    ).toBe(false);
  });

  it("allows a listed role", () => {
    expect(
      canUseAiChat(
        input({
          hasRole: (id) => id === "staff",
          entries: [{ type: "role", entityId: "staff" }],
        }),
      ),
    ).toBe(true);
    expect(
      canUseAiChat(
        input({
          hasRole: () => false,
          entries: [{ type: "role", entityId: "staff" }],
        }),
      ),
    ).toBe(false);
  });

  it("allows mods when the special mods entry is set", () => {
    expect(
      canUseAiChat(
        input({
          isMod: true,
          entries: [{ type: "special", entityId: "mods" }],
        }),
      ),
    ).toBe(true);
    expect(
      canUseAiChat(
        input({
          isMod: false,
          entries: [{ type: "special", entityId: "mods" }],
        }),
      ),
    ).toBe(false);
  });

  it("restricts to superdevs when that is the only entry", () => {
    expect(
      canUseAiChat(
        input({
          isSuperdev: false,
          isMod: true,
          entries: [{ type: "special", entityId: "superdev" }],
        }),
      ),
    ).toBe(false);
  });
});
