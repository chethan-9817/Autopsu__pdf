import { motion } from "framer-motion";
import { ArrowRight, FileText } from "lucide-react";
import { useState } from "react";
import type { TrapResult, TrapSeverity } from "../engine/adversarialTraps";
import { formatINR, formatPercent } from "../engine/format";
import type { FocusCitation } from "./focus";

const TONE: Record<TrapSeverity, { dot: string; amount: string; label: string }> = {
  critical: { dot: "bg-red-500", amount: "text-red-600", label: "High risk" },
  warning: { dot: "bg-amber-500", amount: "text-amber-600", label: "Medium risk" },
  clear: { dot: "bg-emerald-500", amount: "text-emerald-600", label: "Low risk" },
};

interface Props {
  traps: TrapResult[];
  onLoad: (trap: TrapResult) => void;
  onFocus: FocusCitation;
}

export function TrapCards({ traps, onLoad, onFocus }: Props) {
  const found = traps.filter((t) => t.severity !== "clear").length;
  return (
    <section aria-labelledby="traps-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="traps-title" className="text-[15px] font-semibold text-slate-900">
          Where this policy costs you money
        </h2>
        <p className="text-[13px] text-slate-500">
          {found === 0 ? "All three test claims pass" : `${found} of 3 test claims leave you paying`}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {traps.map((trap, i) => (
          <TrapCard key={trap.id} trap={trap} index={i} onLoad={onLoad} onFocus={onFocus} />
        ))}
      </div>
    </section>
  );
}

function TrapCard({ trap, index, onLoad, onFocus }: { trap: TrapResult; index: number } & Omit<Props, "traps">) {
  const [open, setOpen] = useState(false);
  const tone = TONE[trap.severity];
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col rounded-xl border border-line bg-white p-5 transition-shadow duration-200 hover:shadow-sm"
    >
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
        {tone.label}
      </div>
      <h3 className="mt-2 text-[14px] font-semibold leading-snug text-slate-900">{trap.title}</h3>
      <p className="mt-0.5 truncate text-xs text-slate-500" title={trap.scenarioLabel}>
        {trap.scenarioLabel}
      </p>

      <div className="mt-5">
        <div className={`num text-[26px] font-semibold leading-none tracking-tight ${tone.amount}`}>{formatINR(trap.headlineINR)}</div>
        <div className="mt-1.5 text-xs text-slate-500">
          {formatPercent(trap.headlinePercent)} of the bill · {trap.headlineLabel}
        </div>
      </div>

      <p className={`mt-4 flex-1 text-[13px] leading-relaxed text-slate-600 ${open ? "" : "line-clamp-2"}`}>{trap.insight}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1 self-start text-xs font-medium text-slate-500 hover:text-slate-900"
      >
        {open ? "Less" : "More"}
      </button>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={() => onLoad(trap)}
          className="flex items-center gap-1.5 text-[13px] font-medium text-slate-900 hover:text-slate-600"
        >
          Try in simulator <ArrowRight className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onFocus(trap.citation, trap.title, trap.headlineINR)}
          title={`Show ${trap.citation.clauseId} on page ${trap.citation.pageNumber}`}
          aria-label={`Show clause in the policy, page ${trap.citation.pageNumber}`}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <FileText className="size-3.5" aria-hidden /> Clause
        </button>
      </div>
    </motion.article>
  );
}
