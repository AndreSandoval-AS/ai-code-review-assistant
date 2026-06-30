/**
 * Offline runtime check (no API key): build the knowledge base and run a few
 * retrieval queries through the Parent Document Retriever, printing which
 * standards/code each query surfaces. Proves ingest + retrieval work end-to-end
 * using only the local embeddings baked into the image.
 */
import { buildKnowledgeBase } from "../ingest.js";

const QUERIES = [
  "adding a discount code to order creation; how to validate input and handle errors",
  "JWT token expiry verification in auth middleware",
  "how should PR descriptions and commit messages be formatted",
];

async function main() {
  const retriever = await buildKnowledgeBase();
  for (const q of QUERIES) {
    const docs = await retriever.invoke(q);
    console.log(`\nQ: ${q}`);
    console.log(`  -> ${docs.length} parent docs:`);
    for (const d of docs) {
      console.log(`     - ${d.metadata?.category}:${d.metadata?.source} (${d.pageContent.length} chars)`);
    }
  }
}

main().catch((e) => {
  console.error("retrieval test failed:", e);
  process.exit(1);
});
