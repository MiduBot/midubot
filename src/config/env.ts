import { z } from "zod";

const OWNER_ID = "398321973404368927";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_PREFIX: z.string().default("m!"),
  DISCORD_CLIENT_ID: z.string().optional(),
  TURSO_CONNECTION_URL: z.string().min(1, "TURSO_CONNECTION_URL is required"),
  TURSO_AUTH_TOKEN: z.string().min(1, "TURSO_AUTH_TOKEN is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
  AI_API_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("deepseek-v4-flash"),
  JOB_CHANNEL_ID: z.string().optional(),
  SUPERDEV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

const extraIds = env.SUPERDEV
  ? env.SUPERDEV.split(",").map((id) => id.trim()).filter(Boolean)
  : [];

export const superdevs: string[] = [OWNER_ID, ...extraIds];

export function isSuperdev(userId: string): boolean {
  return superdevs.includes(userId);
}
