/**
 * Tier-1 smoke test: validates the embeddings (offline, no key) and — if API
 * keys are present — a primary + fallback chat round-trip.
 *   docker compose run --rm app  (after setting entrypoint) — or locally:
 *   npm run start is the real CLI; this is just a wiring check.
 */
import { config, createEmbeddings, createChatModel, providerChain } from "../config.js";

async function main() {
  console.log("Provider chain:", providerChain().join(" -> "));

  // 1) Embeddings — always runs, no API key needed.
  const embeddings = createEmbeddings();
  const v = await embeddings.embedQuery("smoke test");
  console.log(`✓ embeddings ok (model=${config.embeddingModel}, dim=${v.length})`);

  // 2) Chat — only if a key for the primary provider is configured.
  const hasKey =
    (config.provider === "groq" && config.groq.apiKey) ||
    (config.provider === "gemini" && config.gemini.apiKey) ||
    (config.provider === "openai" && config.openai.apiKey) ||
    (config.provider === "anthropic" && config.anthropic.apiKey);

  if (!hasKey) {
    console.log("• chat skipped (no API key for primary provider — set it in .env)");
    return;
  }

  const model = await createChatModel();
  const res: any = await model.invoke("Reply with exactly three words: prototype is alive");
  console.log("✓ chat ok:", typeof res?.content === "string" ? res.content : res);
}

main().catch((err) => {
  console.error("smoke test failed:", err);
  process.exit(1);
});
