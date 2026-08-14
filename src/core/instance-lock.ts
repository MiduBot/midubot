import { eq, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { botInstanceTable } from "@/db/schema";
import { logger } from "@/core/logger";

export const INSTANCE_LOCK_ID = 1;
export const INSTANCE_LOCK_POLL_MS = 1_000;

export function createInstanceId(): string {
  return crypto.randomUUID();
}

export async function ensureInstanceLockTable(): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS bot_instance (
      id integer PRIMARY KEY NOT NULL,
      instance_id text NOT NULL,
      claimed_at integer DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
}

export async function claimInstance(instanceId: string): Promise<void> {
  await ensureInstanceLockTable();
  const claimedAt = new Date();
  await db
    .insert(botInstanceTable)
    .values({ id: INSTANCE_LOCK_ID, instanceId, claimedAt })
    .onConflictDoUpdate({
      target: botInstanceTable.id,
      set: { instanceId, claimedAt },
    });
}

export async function isCurrentInstance(instanceId: string): Promise<boolean> {
  const row = await db.query.botInstanceTable.findFirst({
    where: eq(botInstanceTable.id, INSTANCE_LOCK_ID),
  });
  return row?.instanceId === instanceId;
}

export function watchInstance(
  instanceId: string,
  onLost: () => void,
  intervalMs = INSTANCE_LOCK_POLL_MS,
): () => void {
  let lost = false;
  const timer = setInterval(() => {
    void (async () => {
      if (lost) return;
      try {
        if (await isCurrentInstance(instanceId)) return;
        lost = true;
        onLost();
      } catch (error) {
        logger.error("Instance lock check failed", error);
      }
    })();
  }, intervalMs);
  return () => clearInterval(timer);
}
