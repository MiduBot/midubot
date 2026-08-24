export type AiChatAllowType = "member" | "role" | "special";
export type AiChatAllowSpecial = "superdev" | "mods";

export interface AiChatAllowEntry {
  type: AiChatAllowType;
  entityId: string;
}

export interface CanUseAiChatInput {
  entries: readonly AiChatAllowEntry[];
  authorId: string;
  isSuperdev: boolean;
  isMod: boolean;
  hasRole: (roleId: string) => boolean;
}

export function canUseAiChat(input: CanUseAiChatInput): boolean {
  if (input.isSuperdev) return true;
  if (input.entries.length === 0) return true;

  for (const entry of input.entries) {
    if (entry.type === "member" && entry.entityId === input.authorId) {
      return true;
    }
    if (entry.type === "role" && input.hasRole(entry.entityId)) {
      return true;
    }
    if (
      entry.type === "special" &&
      entry.entityId === "superdev" &&
      input.isSuperdev
    ) {
      return true;
    }
    if (entry.type === "special" && entry.entityId === "mods" && input.isMod) {
      return true;
    }
  }

  return false;
}

export function isAllowSpecial(entityId: string): entityId is AiChatAllowSpecial {
  return entityId === "superdev" || entityId === "mods";
}
