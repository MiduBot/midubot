import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { ModRoleService } from "@/features/ai-mod/services/mod-role.service";
import { NotifyTargetsService } from "@/features/ai-mod/services/notify-targets.service";

type ReviewInteraction = ButtonInteraction | ModalSubmitInteraction;

type MemberLike = {
  permissions?: { has: (permission: unknown) => boolean };
  roles?: { cache?: { has: (roleId: string) => boolean } };
};

export async function canReviewModeration(
  interaction: ReviewInteraction,
): Promise<boolean> {
  const guildId = interaction.guildId;
  if (!guildId) return false;

  const member = interaction.member as unknown as MemberLike | null;
  if (member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;

  const [modRoles, notifyTargets] = await Promise.all([
    ModRoleService.list(guildId),
    NotifyTargetsService.list(guildId),
  ]);
  const roleCache = member?.roles?.cache;
  if (modRoles.some((role) => roleCache?.has(role.roleId))) return true;
  if (notifyTargets.some((target) =>
    target.targetType === "user" && target.targetId === interaction.user.id,
  )) return true;
  return notifyTargets.some((target) =>
    target.targetType === "role" && roleCache?.has(target.targetId),
  );
}
