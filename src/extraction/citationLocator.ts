/**
 * Deterministic citation grounding. LLM bounding boxes on PDFs drift, but the
 * PDF text layer does not: we search each page's text for the verbatim quote
 * and build box2d from the matched glyph runs. Gemini's box is only a fallback.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface TextSpan {
  start: number;
  end: number;
  rect: [number, number, number, number]; // x0, y0, x1, y1 in page viewport units (top-left origin)
}

export interface PageTextIndex {
  pageNumber: number;
  text: string; // normalized
  spans: TextSpan[];
  width: number;
  height: number;
}

export interface LocatedBox {
  pageNumber: number;
  box2d: [number, number, number, number];
  matchedFully: boolean;
}

/** Lower-case alphanumerics separated by single spaces; ₹ and "Rs." converge to "rs". */
export function normalizeText(s: string): string {
  return s
    .replace(/₹/g, " rs ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function buildTextIndex(doc: PDFDocumentProxy): Promise<PageTextIndex[]> {
  const pages: PageTextIndex[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let text = "";
    const spans: TextSpan[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const norm = normalizeText(item.str);
      if (!norm) continue;
      if (text) text += " ";
      const start = text.length;
      text += norm;
      const [, , c, d, e, f] = item.transform as number[];
      const h = item.height || Math.hypot(c, d) || 10;
      const [ax, ay] = viewport.convertToViewportPoint(e, f - h * 0.25) as number[];
      const [bx, by] = viewport.convertToViewportPoint(e + item.width, f + h) as number[];
      spans.push({
        start,
        end: text.length,
        rect: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)],
      });
    }
    pages.push({ pageNumber: n, text, spans, width: viewport.width, height: viewport.height });
    page.cleanup();
  }
  return pages;
}

function findRange(pageText: string, quote: string): { start: number; end: number; full: boolean } | null {
  const full = pageText.indexOf(quote);
  if (full >= 0) return { start: full, end: full + quote.length, full: true };

  const words = quote.split(" ");
  for (const n of [12, 8, 6]) {
    if (words.length < n) continue;
    const head = words.slice(0, n).join(" ");
    const tail = words.slice(-n).join(" ");
    const h = pageText.indexOf(head);
    if (h >= 0) {
      const t = pageText.indexOf(tail, h + head.length - 1);
      if (t >= 0 && t - h < quote.length * 1.6 + 200) return { start: h, end: t + tail.length, full: false };
      return { start: h, end: h + head.length, full: false };
    }
    const t = pageText.indexOf(tail);
    if (t >= 0) return { start: t, end: t + tail.length, full: false };
  }
  // Short quotes (table cells): require the whole thing.
  return null;
}

export function locateQuote(index: PageTextIndex[], verbatimQuote: string, preferredPage = 1): LocatedBox | null {
  const quote = normalizeText(verbatimQuote);
  if (quote.length < 4) return null;
  const order = [...index].sort(
    (a, b) => Math.abs(a.pageNumber - preferredPage) - Math.abs(b.pageNumber - preferredPage),
  );
  for (const page of order) {
    const range = findRange(page.text, quote);
    if (!range) continue;
    const hit = page.spans.filter((s) => s.start < range.end && s.end > range.start);
    if (hit.length === 0) continue;
    const pad = 3;
    const x0 = Math.min(...hit.map((s) => s.rect[0])) - pad;
    const y0 = Math.min(...hit.map((s) => s.rect[1])) - pad;
    const x1 = Math.max(...hit.map((s) => s.rect[2])) + pad;
    const y1 = Math.max(...hit.map((s) => s.rect[3])) + pad;
    const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
    return {
      pageNumber: page.pageNumber,
      box2d: [clamp((y0 / page.height) * 1000), clamp((x0 / page.width) * 1000), clamp((y1 / page.height) * 1000), clamp((x1 / page.width) * 1000)],
      matchedFully: range.full,
    };
  }
  return null;
}
