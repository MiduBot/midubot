import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { env } from "@/config/env";
import { logger } from "@/core/logger";

const AI_TIMEOUT_MS = 180_000;

export type ChatTurn = { role: "user" | "assistant"; content: string };

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
    return this.generate(systemPrompt, [{ role: "user", content: userPrompt }], {
      temperature: 0,
      timeoutMs: AI_TIMEOUT_MS,
    });
  }

  static async chatMessages(
    systemPrompt: string,
    messages: ChatTurn[],
    options?: { temperature?: number; timeoutMs?: number },
  ): Promise<string | null> {
    return this.generate(systemPrompt, messages, {
      temperature: options?.temperature ?? 0.9,
      timeoutMs: options?.timeoutMs ?? 25_000,
    });
  }

  private static async generate(
    systemPrompt: string,
    messages: ChatTurn[],
    options: { temperature: number; timeoutMs: number },
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
        messages,
        temperature: options.temperature,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(options.timeoutMs),
      });

      return text;
    } catch (e) {
      logger.warn(`AIClientService: AI request failed: ${e}`);
      return null;
    }
  }
}
