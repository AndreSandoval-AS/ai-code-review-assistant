/**
 * Central configuration + the provider-swappable model/embeddings factory.
 *
 * The whole point of building on LangChain is that the orchestration is written
 * ONCE and the model vendor is a config detail. Everything here is driven by
 * environment variables (see example.env); switching `LLM_PROVIDER` is the only
 * change needed to move between Groq / Gemini / OpenAI / Anthropic.
 */
import "dotenv/config";
import { env as hfEnv } from "@huggingface/transformers";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";
import type { Runnable } from "@langchain/core/runnables";

export type Provider = "groq" | "gemini" | "openai" | "anthropic";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  provider: (process.env.LLM_PROVIDER || "groq").toLowerCase() as Provider,
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  },
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
  },
  embeddingModel: process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
  childChunkSize: intEnv("CHILD_CHUNK_SIZE", 400),
  parentChunkSize: intEnv("PARENT_CHUNK_SIZE", 2000),
  retrieverTopK: intEnv("RETRIEVER_TOP_K", 4),
  maxDiffTokens: intEnv("MAX_DIFF_TOKENS", 6000),
  langsmithTracing: (process.env.LANGSMITH_TRACING || "false").toLowerCase() === "true",
  hfCacheDir: process.env.HF_CACHE_DIR,
} as const;

// Pin the Transformers.js cache to the path the model was baked into at build
// time, so the container embeds offline with zero network at runtime.
if (config.hfCacheDir) {
  hfEnv.cacheDir = config.hfCacheDir;
}

function requireKey(key: string | undefined, name: string): asserts key is string {
  if (!key || key.trim() === "") {
    throw new Error(
      `Missing ${name}. Copy example.env to .env and fill it in (see README).`,
    );
  }
}

/** Local, in-process embeddings — no API key, no network at runtime, $0. */
export function createEmbeddings(): Embeddings {
  return new HuggingFaceTransformersEmbeddings({ model: config.embeddingModel });
}

/** Build a single chat model for the given provider. */
export async function buildModel(
  provider: Provider,
  opts: { temperature?: number; maxRetries?: number } = {},
): Promise<BaseChatModel> {
  const temperature = opts.temperature ?? 0.2;
  const maxRetries = opts.maxRetries ?? 2;

  switch (provider) {
    case "groq":
      requireKey(config.groq.apiKey, "GROQ_API_KEY");
      return new ChatGroq({
        apiKey: config.groq.apiKey,
        model: config.groq.model,
        temperature,
        maxRetries,
      });

    case "gemini":
      requireKey(config.gemini.apiKey, "GOOGLE_API_KEY");
      return new ChatGoogleGenerativeAI({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
        temperature,
        maxRetries,
      });

    case "openai": {
      // Optional providers are loaded lazily so we don't ship unused vendor SDKs
      // in the image. Install @langchain/openai to enable.
      const mod = await importOptional("@langchain/openai");
      requireKey(config.openai.apiKey, "OPENAI_API_KEY");
      return new mod.ChatOpenAI({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
        temperature,
        maxRetries,
      });
    }

    case "anthropic": {
      const mod = await importOptional("@langchain/anthropic");
      requireKey(config.anthropic.apiKey, "ANTHROPIC_API_KEY");
      return new mod.ChatAnthropic({
        apiKey: config.anthropic.apiKey,
        model: config.anthropic.model,
        temperature,
        maxRetries,
      });
    }

    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (use groq|gemini|openai|anthropic).`);
  }
}

// Variable specifier keeps tsc from statically requiring the optional package.
async function importOptional(pkg: string): Promise<any> {
  try {
    return await import(pkg);
  } catch {
    throw new Error(
      `Provider package "${pkg}" is not installed. Run: npm install ${pkg}`,
    );
  }
}

/**
 * Provider priority order: the configured primary, then Google Gemini as a
 * real cross-provider fallback (when a key is present and it isn't already
 * primary). This is what makes the failover live, not theoretical.
 */
export function providerChain(): Provider[] {
  const chain: Provider[] = [config.provider];
  if (config.provider !== "gemini" && config.gemini.apiKey) {
    chain.push("gemini");
  }
  return chain;
}

/** Plain chat model with cross-provider fallback (used by the smoke test). */
export async function createChatModel(): Promise<Runnable> {
  const models = await Promise.all(providerChain().map((p) => buildModel(p)));
  const [primary, ...rest] = models;
  return rest.length ? primary.withFallbacks(rest) : primary;
}

/**
 * Structured-output model with cross-provider fallback.
 * Structured output is bound to EACH provider first, then wrapped in fallbacks,
 * so a Groq failure transparently fails over to Gemini and STILL returns the
 * validated schema shape.
 */
export async function createStructuredModel<T extends Record<string, unknown>>(
  schema: unknown,
  name = "pr_review",
): Promise<Runnable<unknown, T>> {
  const models = await Promise.all(providerChain().map((p) => buildModel(p)));
  const structured = models.map(
    (m) => m.withStructuredOutput(schema as any, { name }) as Runnable<unknown, T>,
  );
  const [primary, ...rest] = structured;
  return rest.length ? primary.withFallbacks(rest) : primary;
}
