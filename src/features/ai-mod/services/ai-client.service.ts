import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type ModelMessage } from "ai";
import { env } from "@/config/env";
import { logger } from "@/core/logger";

const AI_TIMEOUT_MS = 180_000;
const MAX_CONCURRENT_REQUESTS = 3;

export type ChatTurn = Extract<ModelMessage, { role: "user" | "assistant" }>;

export interface AIGenerationResult {
  text: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string;
}

export interface ChatOptions {
  temperature?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  model?: string;
}

let activeRequests = 0;
const requestWaiters: Array<{
  grant: () => void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

async function acquireRequestSlot(timeoutMs: number): Promise<boolean> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const waiter = {
      grant: () => {
        clearTimeout(waiter.timer);
        resolve(true);
      },
      timer: setTimeout(() => {
        const index = requestWaiters.indexOf(waiter);
        if (index !== -1) requestWaiters.splice(index, 1);
        resolve(false);
      }, timeoutMs),
    };
    requestWaiters.push(waiter);
  });
}

function releaseRequestSlot(): void {
  const next = requestWaiters.shift();
  if (next) {
    next.grant();
  } else {
    activeRequests--;
  }
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
}

const clineFetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
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
}, { preconnect: fetch.preconnect });

export class AIClientService {
  /**
   * Calls the configured OpenAI-compatible chat-completions endpoint using the Vercel AI SDK.
   * Returns the generated text string, or null on any failure (missing env, error, timeout).
   */
  static async chat(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string | null> {
    const result = await this.generate(
      systemPrompt,
      [{ role: "user", content: userPrompt }],
      {
        temperature: 0,
        timeoutMs: AI_TIMEOUT_MS,
        model: env.AI_MODEL,
      },
    );
    return result?.text ?? null;
  }

  static async chatMessages(
    systemPrompt: string,
    messages: ChatTurn[],
    options?: ChatOptions,
  ): Promise<string | null> {
    const result = await this.chatMessagesDetailed(systemPrompt, messages, options);
    return result?.text ?? null;
  }

  static async chatMessagesDetailed(
    systemPrompt: string,
    messages: ChatTurn[],
    options?: ChatOptions,
  ): Promise<AIGenerationResult | null> {
    return this.generate(systemPrompt, messages, {
      temperature: options?.temperature ?? 0.9,
      timeoutMs: options?.timeoutMs ?? 25_000,
      maxOutputTokens: options?.maxOutputTokens,
      model: options?.model ?? env.AI_CHAT_MODEL ?? env.AI_MODEL,
    });
  }

  private static async generate(
    systemPrompt: string,
    messages: ChatTurn[],
    options: {
      temperature: number;
      timeoutMs: number;
      maxOutputTokens?: number;
      model: string;
    },
  ): Promise<AIGenerationResult | null> {
    if (!env.AI_API_URL || !env.AI_API_KEY) return null;

    const startedAt = Date.now();
    const acquired = await acquireRequestSlot(options.timeoutMs);
    if (!acquired) {
      logger.warn("AIClientService: timed out waiting for a request slot");
      return null;
    }

    const remainingMs = options.timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      releaseRequestSlot();
      return null;
    }
    try {
      const provider = createOpenAICompatible({
        name: "openai-compatible",
        baseURL: normalizeBaseUrl(env.AI_API_URL),
        apiKey: env.AI_API_KEY,
        fetch: clineFetch,
      });

      const result = await generateText({
        model: provider(options.model),
        system: systemPrompt,
        messages,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(remainingMs),
      });

      const response = {
        text: result.text,
        model: options.model,
        latencyMs: Date.now() - startedAt,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        finishReason: result.finishReason ?? "unknown",
      };
      logger.info(
        `AIClientService: model=${response.model} latencyMs=${response.latencyMs} inputTokens=${response.inputTokens ?? "?"} outputTokens=${response.outputTokens ?? "?"} finish=${response.finishReason}`,
      );
      return response;
    } catch (e) {
      logger.warn(`AIClientService: AI request failed: ${e}`);
      return null;
    } finally {
      releaseRequestSlot();
    }
  }
}
