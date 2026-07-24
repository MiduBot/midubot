import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { env } from "@/config/env";
import { logger } from "@/core/logger";

const AI_TIMEOUT_MS = 15000;

const clineFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.status === 200) {
    const cloned = response.clone();
    const text = await cloned.text();
    try {
      const parsed = JSON.parse(text);
      if (
        parsed != null &&
        typeof parsed === "object" &&
        "data" in parsed &&
        parsed.success === true
      ) {
        return new Response(JSON.stringify(parsed.data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    } catch {
      // not a wrapped response, return original
    }
  }

  return response;
};

export class AIClientService {
  /**
   * Calls the configured OpenAI-compatible chat-completions endpoint using the Vercel AI SDK.
   * Returns the generated text string, or null on any failure (missing env, error, timeout).
   */
  static async chat(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string | null> {
    if (!env.AI_API_URL || !env.AI_API_KEY) return null;

    try {
      const provider = createOpenAICompatible({
        name: "openai-compatible",
        baseURL: env.AI_API_URL,
        apiKey: env.AI_API_KEY,
        fetch: clineFetch,
      });

      const { text } = await generateText({
        model: provider(env.AI_MODEL),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });

      return text;
    } catch (e) {
      logger.warn(`AIClientService: AI request failed: ${e}`);
      return null;
    }
  }
}
