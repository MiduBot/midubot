import type { Message } from "discord.js";

export type ReportEntry = {
  reporterIds: Set<string>;
  originalMessage: Message;
  expiresAt: number;
};

const reports = new Map<string, ReportEntry>();
const processedQuorumIds = new Map<string, number>();
const TTL = 30 * 60 * 1000;

export type AddReportResult =
  | { kind: "added"; count: number; isQuorum: boolean }
  | { kind: "self_report" }
  | { kind: "already_processed" }
  | { kind: "already_reported" };

export function addReport(
  originalMessageId: string,
  reporterId: string,
  originalMessage: Message,
): AddReportResult {
  const processedAt = processedQuorumIds.get(originalMessageId);
  if (processedAt !== undefined) {
    return { kind: "already_processed" };
  }

  if (reporterId === originalMessage.author.id) {
    return { kind: "self_report" };
  }

  let entry = reports.get(originalMessageId);
  if (!entry) {
    entry = {
      reporterIds: new Set(),
      originalMessage,
      expiresAt: Date.now() + TTL,
    };
    reports.set(originalMessageId, entry);
  }

  if (entry.reporterIds.has(reporterId)) {
    return { kind: "already_reported" };
  }

  entry.reporterIds.add(reporterId);
  const count = entry.reporterIds.size;
  const isQuorum = count >= 3;

  if (isQuorum) {
    processedQuorumIds.set(originalMessageId, entry.expiresAt);
  }

  return { kind: "added", count, isQuorum };
}

export function getReport(originalMessageId: string): ReportEntry | undefined {
  return reports.get(originalMessageId);
}

export function removeReport(originalMessageId: string): void {
  reports.delete(originalMessageId);
}

export function markQuorumProcessed(originalMessageId: string): void {
  processedQuorumIds.set(originalMessageId, Date.now() + TTL);
}

export function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, entry] of reports.entries()) {
    if (now > entry.expiresAt) {
      reports.delete(id);
      processedQuorumIds.delete(id);
    }
  }
  for (const [id, expiresAt] of processedQuorumIds.entries()) {
    if (now > expiresAt) {
      processedQuorumIds.delete(id);
    }
  }
}

setInterval(cleanupExpired, 5 * 60 * 1000).unref();
