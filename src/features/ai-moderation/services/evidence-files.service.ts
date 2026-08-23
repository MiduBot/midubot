import type { ModerationCandidate } from "../types";

const MAX_FILES = 2;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export interface AttachmentPayload {
  attachment: Buffer;
  name: string;
}

export async function prepareEvidenceFiles(
  attachments: ModerationCandidate["attachments"],
  fetchImpl: typeof fetch = fetch,
): Promise<AttachmentPayload[]> {
  const files: AttachmentPayload[] = [];
  let totalBytes = 0;
  const images = attachments
    .filter((attachment) => attachment.contentType?.startsWith("image/"))
    .slice(0, MAX_FILES);

  for (const image of images) {
    try {
      const response = await fetchImpl(image.url);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (totalBytes + bytes.length > MAX_TOTAL_BYTES) continue;
      files.push({ attachment: bytes, name: image.name });
      totalBytes += bytes.length;
    } catch {
      // Evidence copy is best effort; metadata remains in the embed.
    }
  }

  return files;
}
