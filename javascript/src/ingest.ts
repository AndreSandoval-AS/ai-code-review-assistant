/**
 * Knowledge-base ingestion. Loads the team's coding standards (Markdown) and a
 * sample of existing code (TypeScript) from data/, tags each document with
 * metadata (source + category), and feeds them into the Parent Document
 * Retriever. Metadata is what would power Self-Querying in a production system
 * (filter by language/category) — noted as a considered extension in the TDD.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Document } from "@langchain/core/documents";
import type { ParentDocumentRetriever } from "@langchain/classic/retrievers/parent_document";
import { createParentDocumentRetriever } from "./retriever.js";
import { logger } from "./logger.js";

// Resolve data/ relative to the project root regardless of CWD.
const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));

interface Source {
  dir: string;
  category: "standard" | "code";
  exts: string[];
}

const SOURCES: Source[] = [
  { dir: "standards", category: "standard", exts: [".md"] },
  { dir: "sample-code", category: "code", exts: [".ts", ".js"] },
];

async function loadDocuments(): Promise<Document[]> {
  const docs: Document[] = [];

  for (const src of SOURCES) {
    const dirPath = join(DATA_DIR, src.dir);
    let files: string[];
    try {
      files = await readdir(dirPath);
    } catch {
      logger.warn(`knowledge-base directory missing: ${dirPath}`);
      continue;
    }

    for (const file of files) {
      if (!src.exts.some((ext) => file.endsWith(ext))) continue;
      const content = (await readFile(join(dirPath, file), "utf8")).trim();
      if (!content) continue;
      docs.push(
        new Document({
          pageContent: content,
          metadata: {
            source: basename(file),
            category: src.category,
            language: file.endsWith(".md") ? "markdown" : "typescript",
          },
        }),
      );
    }
  }

  return docs;
}

/** Build the retriever and load the knowledge base into it. */
export async function buildKnowledgeBase(): Promise<ParentDocumentRetriever> {
  const retriever = createParentDocumentRetriever();
  const docs = await loadDocuments();

  if (docs.length === 0) {
    logger.warn("knowledge base is empty — retrieval will return no matches.");
    return retriever;
  }

  await retriever.addDocuments(docs);
  logger.info(`knowledge base ready: ${docs.length} source documents indexed.`);
  return retriever;
}
