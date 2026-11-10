/**
 * Writes the two generated sample policy PDFs to public/samples/ so you can
 * try the "Live PDF Upload" (Gemini) path on a known document.
 *   npm run samples
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_DEFINITIONS } from "../src/samples";
import { generatePolicyPdf } from "../src/samples/pdfGenerator";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "samples");
mkdirSync(outDir, { recursive: true });

for (const def of SAMPLE_DEFINITIONS) {
  const pdf = await generatePolicyPdf(def.document);
  writeFileSync(join(outDir, def.fileName), pdf.bytes);
  console.log(`wrote public/samples/${def.fileName} (${pdf.pageCount} pages, ${Object.keys(pdf.boxes).length} cited regions)`);
}
