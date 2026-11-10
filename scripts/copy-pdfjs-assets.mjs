// Copies pdf.js runtime assets (standard fonts, CMaps, wasm image decoders) into
// public/pdfjs so real-world policy PDFs render offline. Runs before dev/build.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");
mkdirSync(dest, { recursive: true });
for (const dir of ["standard_fonts", "cmaps", "wasm", "iccs"]) {
  if (existsSync(join(src, dir))) cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log("[policy-autopsy] pdf.js assets copied to public/pdfjs");
