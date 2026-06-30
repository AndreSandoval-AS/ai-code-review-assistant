/**
 * Pre-download the local embedding model weights so they are baked into the
 * Docker image at build time. At runtime the container can then embed fully
 * offline (no network, no API key, $0). Run automatically during `docker build`.
 */
import { env as hfEnv } from "@huggingface/transformers";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

const cacheDir = process.env.HF_CACHE_DIR || "/app/.hf-cache";
// Pin the Transformers.js cache to a fixed absolute path inside the image so the
// runtime stage finds exactly what the build stage downloaded.
hfEnv.cacheDir = cacheDir;

const model = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";

const embeddings = new HuggingFaceTransformersEmbeddings({ model });
const vector = await embeddings.embedQuery("warmup: pre-download embedding weights");

console.log(
  `[predownload] cached "${model}" into ${cacheDir} (embedding dim = ${vector.length})`,
);
