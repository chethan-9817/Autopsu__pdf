import { AnimatePresence, motion } from "framer-motion";
import { Download, FileText, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTextIndex, locateQuote, type PageTextIndex } from "../extraction/citationLocator";
import { formatINR } from "../engine/format";
import { loadPdf, type PDFDocumentProxy } from "../pdf/pdfjs";
import type { BoxSource, PolicyProfile } from "../types/policy";
import type { CitationFocus } from "./focus";

interface Props {
  profile: PolicyProfile;
  focus: CitationFocus | null;
  onClearFocus: () => void;
}

interface PageSize {
  w: number;
  h: number;
}

interface ResolvedFocus {
  pageNumber: number;
  box2d: [number, number, number, number] | null;
  source: BoxSource | "page-only";
  nonce: number;
}

const SOURCE_LABEL: Record<ResolvedFocus["source"], string> = {
  generator: "Exact position in the document",
  "text-layer": "Found in the document text",
  model: "Approximate position (scanned page)",
  "page-only": "Exact spot not found, so the page is shown",
};

const GUTTER = 16;

export function PdfEvidenceCanvas({ profile, focus, onClearFocus }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [resolved, setResolved] = useState<ResolvedFocus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const textIndex = useRef<Promise<PageTextIndex[]> | null>(null);

  // Load the document whenever the policy changes.
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setSizes([]);
    setError(null);
    setResolved(null);
    textIndex.current = null;
    loadPdf(profile.pdfBytes)
      .then(async (d) => {
        loaded = d;
        const s: PageSize[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const vp = (await d.getPage(i)).getViewport({ scale: 1 });
          s.push({ w: vp.width, h: vp.height });
        }
        if (cancelled) return;
        setSizes(s);
        setDoc(d);
        scrollRef.current?.scrollTo({ top: 0 });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      void loaded?.loadingTask.destroy();
    };
  }, [profile.pdfBytes]);

  // Track the pane width so pages fit it exactly.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Resolve the focused citation to a page + box (lazily grounding quotes that have no box).
  useEffect(() => {
    if (!focus || !doc) return;
    let cancelled = false;
    const c = focus.citation;
    const page = Math.min(Math.max(1, c.pageNumber), doc.numPages);
    if (c.box2d) {
      setResolved({ pageNumber: page, box2d: c.box2d, source: c.boxSource ?? "model", nonce: focus.nonce });
      return;
    }
    setResolved({ pageNumber: page, box2d: null, source: "page-only", nonce: focus.nonce });
    textIndex.current ??= buildTextIndex(doc);
    void textIndex.current.then((index) => {
      if (cancelled) return;
      const hit = locateQuote(index, c.verbatimQuote, page);
      if (hit) setResolved({ pageNumber: hit.pageNumber, box2d: hit.box2d, source: "text-layer", nonce: focus.nonce });
    });
    return () => {
      cancelled = true;
    };
  }, [focus, doc]);

  // Scroll the evidence into view.
  useEffect(() => {
    if (!resolved || !scrollRef.current) return;
    const el = pageRefs.current[resolved.pageNumber - 1];
    if (!el) return;
    const boxTop = resolved.box2d ? (resolved.box2d[0] / 1000) * el.offsetHeight : 0;
    scrollRef.current.scrollTo({ top: Math.max(0, el.offsetTop + boxTop - 110), behavior: "smooth" });
  }, [resolved, width, sizes]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const probe = el.scrollTop + el.clientHeight * 0.3;
    let page = 1;
    pageRefs.current.forEach((p, i) => {
      if (p && p.offsetTop <= probe) page = i + 1;
    });
    setCurrentPage(page);
  }, []);

  const downloadUrl = useMemo(
    () => URL.createObjectURL(new Blob([profile.pdfBytes.slice()], { type: "application/pdf" })),
    [profile.pdfBytes],
  );
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl]);

  const contentWidth = Math.max(0, width - GUTTER * 2);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-slate-100">
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-slate-900">Policy document</div>
          <div className="truncate text-xs text-slate-500">{profile.fileName}</div>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          Page {Math.min(currentPage, sizes.length || 1)} / {sizes.length || "–"}
        </span>
        <a
          href={downloadUrl}
          download={profile.fileName}
          className="grid size-8 place-items-center rounded-md border border-line text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
          title="Download this PDF"
          aria-label="Download PDF"
        >
          <Download className="size-4" aria-hidden />
        </a>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="pane-scroll relative min-h-0 flex-1 overflow-y-auto" style={{ padding: GUTTER }}>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">Could not open this PDF: {error}</p>}
        {!doc && !error && (
          <div className="flex h-64 items-center justify-center gap-2 text-[13px] text-slate-500">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Opening the policy…
          </div>
        )}
        {doc &&
          contentWidth > 0 &&
          sizes.map((size, i) => {
            const scale = contentWidth / size.w;
            const isFocused = resolved?.pageNumber === i + 1;
            return (
              <div
                key={`${profile.id}-${i}`}
                ref={(el) => {
                  pageRefs.current[i] = el;
                }}
                className={`relative mb-4 overflow-hidden rounded-md bg-white shadow-sm transition-shadow duration-300 ${
                  isFocused && !resolved?.box2d ? "ring-2 ring-amber-400" : "ring-1 ring-slate-200"
                }`}
                style={{ width: contentWidth, height: size.h * scale }}
              >
                <PdfPageView doc={doc} pageNumber={i + 1} scale={scale} cssWidth={contentWidth} cssHeight={size.h * scale} root={scrollRef} />
                <AnimatePresence>
                  {isFocused && resolved?.box2d && <EvidenceBox key={resolved.nonce} box={resolved.box2d} label={focus?.citation.clauseId ?? ""} />}
                </AnimatePresence>
                <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                  {i + 1}
                </span>
              </div>
            );
          })}
      </div>

      <AnimatePresence>
        {focus && resolved && (
          <motion.aside
            key={focus.nonce}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="absolute inset-x-4 bottom-4 z-10 rounded-xl border border-line bg-white/95 p-4 shadow-xl shadow-slate-900/10 backdrop-blur"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-semibold text-slate-900">{focus.citation.clauseId}</span>
                  <span className="text-xs text-slate-500">Page {resolved.pageNumber}</span>
                  {focus.impactINR !== undefined && focus.impactINR > 0 && (
                    <span className="text-xs font-semibold text-red-600">Costs you {formatINR(focus.impactINR)}</span>
                  )}
                </div>
                {focus.context && <div className="text-xs text-slate-500">Behind: {focus.context}</div>}
                <blockquote className="pane-scroll mt-2.5 max-h-28 overflow-y-auto border-l-2 border-amber-400 pl-3 text-[13px] leading-relaxed text-slate-700">
                  “{focus.citation.verbatimQuote || "No verbatim quote was extracted for this clause."}”
                </blockquote>
                <div className="mt-2 text-[11px] text-slate-400">{SOURCE_LABEL[resolved.source]}</div>
              </div>
              <button
                type="button"
                onClick={onClearFocus}
                className="grid size-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close evidence"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function EvidenceBox({ box, label }: { box: [number, number, number, number]; label: string }) {
  const [ymin, xmin, ymax, xmax] = box;
  const style = {
    top: `${ymin / 10}%`,
    left: `${xmin / 10}%`,
    width: `${(xmax - xmin) / 10}%`,
    height: `${(ymax - ymin) / 10}%`,
  };
  return (
    <>
      <motion.div
        className="pointer-events-none absolute rounded-[3px]"
        style={{ ...style, boxShadow: "0 0 0 4000px rgb(15 23 42 / 0.10)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        aria-hidden
      />
      <motion.div
        className="evidence-box pointer-events-none absolute rounded-[3px] bg-amber-300/25"
        style={style}
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <span className="absolute -top-5 left-0 max-w-[90%] truncate rounded-t bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {label}
        </span>
      </motion.div>
    </>
  );
}

interface PageViewProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  cssWidth: number;
  cssHeight: number;
  root: React.RefObject<HTMLDivElement | null>;
}

/** Renders one page to canvas, only once it is near the viewport. */
function PdfPageView({ doc, pageNumber, scale, cssWidth, cssHeight, root }: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), {
      root: root.current,
      rootMargin: "900px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    const timer = window.setTimeout(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = page.getViewport({ scale: scale * dpr });
      const off = document.createElement("canvas");
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      task = page.render({ canvas: off, viewport });
      try {
        await task.promise;
        if (cancelled) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d")?.drawImage(off, 0, 0);
        setRendered(true);
      } catch {
        /* render cancelled by a newer scale */
      }
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [doc, pageNumber, scale, visible]);

  return (
    <div ref={holderRef} className="absolute inset-0">
      {!rendered && <div className="absolute inset-0 animate-pulse bg-slate-50" />}
      <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight }} className="block" />
    </div>
  );
}
