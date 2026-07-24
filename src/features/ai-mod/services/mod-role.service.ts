import { db } from "@/db/connection";
import { aiModModRolesTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface ModRoleRow {
  id: number;
  guildId: string;
  roleId: string;
}

export class ModRoleService {
  static async list(guildId: string): Promise<ModRoleRow[]> {
    const rows = await db.query.aiModModRolesTable.findMany({
      where: eq(aiModModRolesTable.guildId, guildId),
    });
    return rows.map((r) => ({ id: r.id, guildId: r.guildId, roleId: r.roleId }));
  }

  static async add(guildId: string, roleId: string): Promise<void> {
    const existing = await db.query.aiModModRolesTable.findFirst({
      where: and(
        eq(aiModModRolesTable.guildId, guildId),
        eq(aiModModRolesTable.roleId, roleId),
      ),
    });
    if (existing) throw new Error("Already a mod role");
    await db.insert(aiModModRolesTable).values({ guildId, roleId });
  }

  static async remove(guildId: string, roleId: string): Promise<void> {
    await db
      .delete(aiModModRolesTable)
      .where(
        and(
          eq(aiModModRolesTable.guildId, guildId),
          eq(aiModModRolesTable.roleId, roleId),
        ),
      );
  }

  static async hasRole(guildId: string, roleId: string): Promise<boolean> {
    const row = await db.query.aiModModRolesTable.findFirst({
      where: and(
        eq(aiModModRolesTable.guildId, guildId),
        eq(aiModModRolesTable.roleId, roleId),
      ),
    });
    return !!row;
  }
}
