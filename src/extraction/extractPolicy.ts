/**
 * Live upload pipeline:
 *   file -> (image? wrap in a 1-page PDF) -> base64 -> /api/extract (Gemini, server-side)
 *        -> normalizeRules (deterministic repair) -> text-layer grounding of every citation
 */
import { PDFDocument } from "pdf-lib";
import type { PolicyProfile } from "../types/policy";
import { loadPdf } from "../pdf/pdfjs";
import { buildTextIndex, locateQuote } from "./citationLocator";
import { allCitations, normalizeRules } from "./normalizeRules";

export type ExtractionStage = "reading" | "gemini" | "validating" | "grounding" | "done";

export interface ExtractionReport {
  profile: PolicyProfile;
  warnings: string[];
  grounded: number; // citations located in the PDF text layer
  totalCitations: number;
  model: string;
  latencyMs: number;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Photos of a policy page become a single-page PDF so the viewer and grounding have one code path. */
async function imageToPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return pdf.save();
}

export async function checkLiveExtraction(): Promise<{ geminiConfigured: boolean; model: string } | null> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return null;
    return (await res.json()) as { geminiConfigured: boolean; model: string };
  } catch {
    return null;
  }
}

export async function extractPolicyFromFile(
  file: File,
  onStage: (stage: ExtractionStage) => void,
): Promise<ExtractionReport> {
  onStage("reading");
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 20 MB, the Gemini inline-upload limit.");
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  let pdfBytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  if (mime === "image/png" || mime === "image/jpeg") {
    pdfBytes = await imageToPdf(pdfBytes, mime);
  } else if (mime !== "application/pdf") {
    throw new Error("Upload a policy PDF (or a PNG/JPEG photo of a page).");
  }

  onStage("gemini");
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: "application/pdf", dataBase64: toBase64(pdfBytes) }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    rules?: unknown;
    error?: string;
    model?: string;
    latencyMs?: number;
    notice?: string;
  };
  if (!res.ok || !payload.rules) throw new Error(payload.error ?? `Extraction failed (HTTP ${res.status})`);

  onStage("validating");
  const { rules, warnings } = normalizeRules(payload.rules);
  if (payload.notice) warnings.unshift(payload.notice);

  onStage("grounding");
  const doc = await loadPdf(pdfBytes);
  const index = await buildTextIndex(doc);
  const citations = allCitations(rules);
  let grounded = 0;
  for (const c of citations) {
    const hit = locateQuote(index, c.verbatimQuote, c.pageNumber);
    if (hit) {
      if (hit.pageNumber !== c.pageNumber) warnings.push(`"${c.clauseId}" was cited on page ${c.pageNumber} but found on page ${hit.pageNumber}.`);
      c.pageNumber = hit.pageNumber;
      c.box2d = hit.box2d;
      c.boxSource = "text-layer";
      grounded++;
    } else if (c.pageNumber > doc.numPages) {
      warnings.push(`"${c.clauseId}" cited page ${c.pageNumber}, but the PDF has ${doc.numPages} pages.`);
      c.pageNumber = doc.numPages;
      delete c.box2d;
      delete c.boxSource;
    }
  }
  const textless = index.every((p) => p.text.length < 20);
  if (textless) warnings.push("This PDF has no text layer (scanned/photo), so boxes are Gemini's visual estimates.");
  await doc.loadingTask.destroy();

  onStage("done");
  return {
    profile: {
      id: `upload-${Date.now()}`,
      label: rules.policyName,
      tagline: `Live extraction · ${rules.insurerName}`,
      source: "upload",
      rules,
      pdfBytes,
      fileName: file.name,
    },
    warnings,
    grounded,
    totalCitations: citations.length,
    model: payload.model ?? "gemini",
    latencyMs: payload.latencyMs ?? 0,
  };
}
