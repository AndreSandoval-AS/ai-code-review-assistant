/** Quick check that the naive "before" prompt hallucinates and "after" fixes it. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildKnowledgeBase } from "../ingest.js";
import { createParentDocumentRetriever } from "../retriever.js";
import { generatePRReview } from "../chain.js";

const D = fileURLToPath(new URL("../../data", import.meta.url));
const diff = await readFile(`${D}/sample-diffs/feature-discount-codes.diff`, "utf8");
const ticket = await readFile(`${D}/sample-tickets/feature-discount-codes.md`, "utf8");

const r = await buildKnowledgeBase();
const empty = createParentDocumentRetriever(); // no documents -> ungrounded
const before = await generatePRReview(empty, { diff, ticket }, { strictGrounding: false, selfCheck: false });
const after = await generatePRReview(r, { diff, ticket }, { strictGrounding: true, selfCheck: true });

function dump(label: string, rev: any) {
  console.log(`\n===== ${label} =====`);
  console.log("CHECKLIST:");
  for (const c of rev.reviewChecklist) console.log(`  - ${c.item}  ::  ${c.rationale}`);
  console.log("RISKS:");
  for (const rf of rev.riskFlags) console.log(`  - [${rf.severity}] ${rf.description}  (std=${rf.relatedStandard})`);
  console.log("CHANGES:", JSON.stringify(rev.description.changes));
}
dump("BEFORE (naive)", before.review);
dump("AFTER (strict)", after.review);
console.log("\nBEFORE out-of-diff:", before.meta.hallucinatedFiles);
console.log("AFTER  out-of-diff:", after.meta.hallucinatedFiles, "retried:", after.meta.selfCheckRetried);
