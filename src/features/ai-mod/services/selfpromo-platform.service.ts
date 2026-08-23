export type SelfpromoPlatform = "youtube" | "linkedin" | "x-instagram" | "other";

const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function classifySelfpromoPlatform(content: string): SelfpromoPlatform {
  for (const token of content.match(URL_PATTERN) ?? []) {
    try {
      const url = new URL(token.replace(/[),.!?]+$/, ""));
      const hostname = url.hostname.toLowerCase();
      if (hostnameMatches(hostname, "youtube.com") || hostname === "youtu.be") return "youtube";
      if (hostnameMatches(hostname, "linkedin.com")) return "linkedin";
      if (
        hostnameMatches(hostname, "x.com") ||
        hostnameMatches(hostname, "twitter.com") ||
        hostnameMatches(hostname, "instagram.com")
      ) {
        return "x-instagram";
      }
    } catch {
      // Ignore malformed URLs and inspect remaining tokens.
    }
  }
  return "other";
}
