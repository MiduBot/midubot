import winston from "winston";
import { env } from "@/config/env";

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      const msg = typeof message === "string" ? message : String(message);
      return `[${level.toUpperCase()}] ${timestamp} - ${msg}${stack ? `\n${stack}` : ""}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});
