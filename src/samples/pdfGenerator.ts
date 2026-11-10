/**
 * Generates realistic-looking (fictional) IRDAI-style policy wordings with pdf-lib.
 * Because we lay the text out ourselves, we record the exact rectangle of every
 * cited clause/table row, so sample citations get pixel-exact box2d values.
 *
 * Pure: runs in the browser (instant offline demo) and in Node (scripts/export-sample-pdfs.ts).
 * Standard PDF fonts are WinAnsi-only, so documents use "Rs." instead of the rupee sign.
 */
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";

export type DocBlock =
  | { kind: "title"; text: string; sub?: string }
  | { kind: "heading"; text: string; cite?: string }
  | { kind: "para"; text: string; label?: string; cite?: string; strong?: boolean }
  | { kind: "bullets"; items: string[]; cite?: string; columns?: 1 | 2 }
  | { kind: "kv"; rows: Array<{ label: string; value: string; cite?: string }> }
  | { kind: "table"; columns: string[]; widths: number[]; rows: Array<{ cells: string[]; cite?: string; highlight?: boolean }> }
  | { kind: "pageBreak" };

export interface SampleDocument {
  insurer: string;
  product: string;
  uin: string;
  blocks: DocBlock[];
}

export interface GeneratedBox {
  pageNumber: number;
  box2d: [number, number, number, number];
}

export interface GeneratedPdf {
  bytes: Uint8Array;
  boxes: Record<string, GeneratedBox>;
  pageCount: number;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 54;
const TOP = 78; // content starts below the running header
const BOTTOM = 70; // content stops above the footer
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.1, 0.12, 0.18);
const MUTED = rgb(0.38, 0.42, 0.5);
const BRAND = rgb(0.05, 0.26, 0.45);
const RULE = rgb(0.78, 0.81, 0.86);
const TABLE_HEAD = rgb(0.9, 0.93, 0.97);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function generatePolicyPdf(doc: SampleDocument): Promise<GeneratedPdf> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.product} - Policy Wording (Sample)`);
  pdf.setAuthor(doc.insurer);
  pdf.setSubject("Fictional sample health insurance policy wording for PolicyAutopsy demos");
  pdf.setProducer("PolicyAutopsy sample generator");
  // Fixed dates keep the output byte-for-byte reproducible.
  pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"));

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];
  const boxes: Record<string, GeneratedBox> = {};
  let page!: PDFPage;
  let y = 0; // distance from the TOP of the page (we convert when drawing)

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = TOP;
  };
  const ensure = (height: number) => {
    if (y + height > PAGE_H - BOTTOM) newPage();
  };
  const text = (s: string, x: number, top: number, size: number, font: PDFFont, color = INK) => {
    // pdf-lib draws at the baseline; `top` is the top of the line box.
    page.drawText(s, { x, y: PAGE_H - top - size * 0.8, size, font, color });
  };
  const record = (key: string | undefined, x0: number, top: number, x1: number, bottom: number) => {
    if (!key) return;
    const pad = 3;
    const box: [number, number, number, number] = [
      Math.max(0, Math.round(((top - pad) / PAGE_H) * 1000)),
      Math.max(0, Math.round(((x0 - pad) / PAGE_W) * 1000)),
      Math.min(1000, Math.round(((bottom + pad) / PAGE_H) * 1000)),
      Math.min(1000, Math.round(((x1 + pad) / PAGE_W) * 1000)),
    ];
    const pageNumber = pages.length;
    const existing = boxes[key];
    if (!existing) {
      boxes[key] = { pageNumber, box2d: box };
    } else if (existing.pageNumber === pageNumber) {
      const b = existing.box2d;
      existing.box2d = [Math.min(b[0], box[0]), Math.min(b[1], box[1]), Math.max(b[2], box[2]), Math.max(b[3], box[3])];
    }
  };

  newPage();

  for (const block of doc.blocks) {
    switch (block.kind) {
      case "pageBreak":
        newPage();
        break;

      case "title": {
        ensure(60);
        text(block.text, MARGIN_X, y, 19, bold, BRAND);
        y += 26;
        if (block.sub) {
          for (const line of wrap(block.sub, regular, 10, CONTENT_W)) {
            text(line, MARGIN_X, y, 10, regular, MUTED);
            y += 14;
          }
        }
        y += 6;
        page.drawLine({ start: { x: MARGIN_X, y: PAGE_H - y }, end: { x: PAGE_W - MARGIN_X, y: PAGE_H - y }, thickness: 1.2, color: BRAND });
        y += 14;
        break;
      }

      case "heading": {
        ensure(40);
        y += 8;
        const start = y;
        text(block.text, MARGIN_X, y, 12.5, bold, BRAND);
        y += 18;
        record(block.cite, MARGIN_X, start, MARGIN_X + bold.widthOfTextAtSize(block.text, 12.5), y - 4);
        break;
      }

      case "para": {
        const size = 9.6;
        const leading = 13.6;
        const font = block.strong ? bold : regular;
        const labelW = block.label ? bold.widthOfTextAtSize(block.label, size) + 8 : 0;
        const indent = block.label ? Math.max(labelW, 38) : 0;
        const lines = wrap(block.text, font, size, CONTENT_W - indent);
        const height = lines.length * leading;
        ensure(height + 6);
        const start = y;
        if (block.label) text(block.label, MARGIN_X, y, size, bold);
        let widest = 0;
        for (const line of lines) {
          text(line, MARGIN_X + indent, y, size, font);
          widest = Math.max(widest, font.widthOfTextAtSize(line, size));
          y += leading;
        }
        record(block.cite, MARGIN_X, start, MARGIN_X + indent + widest, y - 3);
        y += 6;
        break;
      }

      case "bullets": {
        const size = 9.4;
        const leading = 13;
        const cols = block.columns ?? 1;
        const colW = CONTENT_W / cols;
        const perCol = Math.ceil(block.items.length / cols);
        const colLines = Array.from({ length: cols }, (_, c) =>
          block.items.slice(c * perCol, (c + 1) * perCol).map((item) => wrap(item, regular, size, colW - 16)),
        );
        const height = Math.max(...colLines.map((col) => col.reduce((h, l) => h + l.length * leading, 0)));
        ensure(height + 6);
        const start = y;
        colLines.forEach((col, c) => {
          let cy = start;
          const x = MARGIN_X + c * colW;
          for (const itemLines of col) {
            text("•", x + 2, cy, size, bold, BRAND);
            for (const line of itemLines) {
              text(line, x + 14, cy, size, regular);
              cy += leading;
            }
          }
        });
        y = start + height;
        record(block.cite, MARGIN_X, start, PAGE_W - MARGIN_X, y - 2);
        y += 6;
        break;
      }

      case "kv": {
        const size = 9.8;
        const labelW = 150;
        for (const row of block.rows) {
          const lines = wrap(row.value, regular, size, CONTENT_W - labelW);
          const h = lines.length * 14 + 4;
          ensure(h);
          const start = y;
          text(row.label, MARGIN_X, y, size, bold);
          lines.forEach((line, i) => text(line, MARGIN_X + labelW, y + i * 14, size, regular));
          y += h;
          page.drawLine({ start: { x: MARGIN_X, y: PAGE_H - y + 2 }, end: { x: PAGE_W - MARGIN_X, y: PAGE_H - y + 2 }, thickness: 0.4, color: RULE });
          record(row.cite, MARGIN_X, start, PAGE_W - MARGIN_X, y - 3);
          y += 2;
        }
        y += 8;
        break;
      }

      case "table": {
        const size = 9;
        const leading = 12;
        const padX = 6;
        const padY = 5;
        const total = block.widths.reduce((a, b) => a + b, 0);
        const widths = block.widths.map((w) => (w / total) * CONTENT_W);
        const xs = widths.map((_, i) => MARGIN_X + widths.slice(0, i).reduce((a, b) => a + b, 0));

        const drawRow = (cells: string[], font: PDFFont, fill?: ReturnType<typeof rgb>) => {
          const wrapped = cells.map((c, i) => wrap(c, font, size, widths[i] - padX * 2));
          const h = Math.max(...wrapped.map((l) => l.length)) * leading + padY * 2;
          const start = y;
          if (fill) {
            page.drawRectangle({ x: MARGIN_X, y: PAGE_H - start - h, width: CONTENT_W, height: h, color: fill });
          }
          wrapped.forEach((lines, i) =>
            lines.forEach((line, li) => text(line, xs[i] + padX, start + padY + li * leading, size, font)),
          );
          page.drawRectangle({ x: MARGIN_X, y: PAGE_H - start - h, width: CONTENT_W, height: h, borderColor: RULE, borderWidth: 0.6 });
          xs.slice(1).forEach((x) =>
            page.drawLine({ start: { x, y: PAGE_H - start }, end: { x, y: PAGE_H - start - h }, thickness: 0.6, color: RULE }),
          );
          y += h;
          return { start, h };
        };
        const rowHeight = (cells: string[], font: PDFFont) =>
          Math.max(...cells.map((c, i) => wrap(c, font, size, widths[i] - padX * 2).length)) * leading + padY * 2;

        ensure(rowHeight(block.columns, bold) + rowHeight(block.rows[0]?.cells ?? [""], regular));
        drawRow(block.columns, bold, TABLE_HEAD);
        for (const row of block.rows) {
          const h = rowHeight(row.cells, regular);
          if (y + h > PAGE_H - BOTTOM) {
            newPage();
            drawRow(block.columns, bold, TABLE_HEAD);
          }
          const { start } = drawRow(row.cells, regular, row.highlight ? rgb(0.99, 0.96, 0.9) : undefined);
          record(row.cite, MARGIN_X, start, PAGE_W - MARGIN_X, y);
        }
        y += 12;
        break;
      }
    }
  }

  // Running header / footer / watermark, now that the page count is known.
  pages.forEach((p, i) => {
    const hdr = 9;
    p.drawText(doc.insurer, { x: MARGIN_X, y: PAGE_H - 40, size: hdr, font: bold, color: BRAND });
    const right = `${doc.product}  |  UIN: ${doc.uin}`;
    p.drawText(right, { x: PAGE_W - MARGIN_X - regular.widthOfTextAtSize(right, 8), y: PAGE_H - 40, size: 8, font: regular, color: MUTED });
    p.drawLine({ start: { x: MARGIN_X, y: PAGE_H - 50 }, end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 50 }, thickness: 0.6, color: RULE });

    p.drawLine({ start: { x: MARGIN_X, y: 50 }, end: { x: PAGE_W - MARGIN_X, y: 50 }, thickness: 0.6, color: RULE });
    p.drawText("FICTIONAL SAMPLE WORDING FOR DEMONSTRATION ONLY. NOT AN ACTUAL INSURANCE PRODUCT.", { x: MARGIN_X, y: 36, size: 7, font: regular, color: MUTED });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: PAGE_W - MARGIN_X - regular.widthOfTextAtSize(pg, 8), y: 36, size: 8, font: regular, color: MUTED });

    p.drawText("SAMPLE", { x: 150, y: 330, size: 110, font: bold, color: rgb(0.05, 0.26, 0.45), opacity: 0.035, rotate: degrees(35) });
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, boxes, pageCount: pages.length };
}
