/**
 * Parent Document Retrieval setup.
 *
 * The advanced retrieval technique for this project: index SMALL child chunks
 * for precise vector matching, but return the LARGER parent document to the LLM
 * for context. This is the right fit for code/standards, where a one-line match
 * only makes sense alongside its surrounding function or section.
 *
 *   child chunks  -> MemoryVectorStore (similarity search happens here)
 *   parent docs   -> InMemoryStore     (full context returned to the LLM)
 */
import { ParentDocumentRetriever } from "@langchain/classic/retrievers/parent_document";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { InMemoryStore } from "@langchain/core/stores";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { config, createEmbeddings } from "./config.js";

export function createParentDocumentRetriever(): ParentDocumentRetriever {
  const vectorstore = new MemoryVectorStore(createEmbeddings());
  const byteStore = new InMemoryStore<Uint8Array>();

  return new ParentDocumentRetriever({
    vectorstore,
    byteStore,
    // Small, precise chunks that get embedded and searched.
    childSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: config.childChunkSize,
      chunkOverlap: Math.floor(config.childChunkSize * 0.1),
    }),
    // Larger parents returned to the LLM once a child matches.
    parentSplitter: new RecursiveCharacterTextSplitter({
      chunkSize: config.parentChunkSize,
      chunkOverlap: Math.floor(config.parentChunkSize * 0.1),
    }),
    // Fetch many child candidates, return the top-K distinct parents.
    childK: 20,
    parentK: config.retrieverTopK,
  });
}
