import { AnimatePresence, motion } from "framer-motion";
import { BedDouble, ChevronDown, FileText, Hourglass, Info, Landmark, Package, Percent, Scale, Scissors } from "lucide-react";
import { useState } from "react";
import { formatINR, formatPercent } from "../engine/format";
import type { DeductionStep, SimulationBreakdown } from "../types/simulation";
import { AnimatedINR } from "./AnimatedINR";
import type { CitationFocus, FocusCitation } from "./focus";

const STEP_META: Record<DeductionStep, { icon: typeof Info; color: string; label: string }> = {
  WAITING_PERIOD: { icon: Hourglass, color: "#b91c1c", label: "Waiting period" },
  CONSUMABLES: { icon: Package, color: "#f59e0b", label: "Consumables" },
  ROOM_RENT_EXCESS: { icon: BedDouble, color: "#fb923c", label: "Room above limit" },
  PROPORTIONATE_DEDUCTION: { icon: Scale, color: "#dc2626", label: "Proportionate cut" },
  SUB_LIMIT: { icon: Scissors, color: "#a855f7", label: "Treatment cap" },
  CO_PAY: { icon: Percent, color: "#f472b6", label: "Co-pay" },
  SUM_INSURED_CAP: { icon: Landmark, color: "#64748b", label: "Sum insured" },
};

const SPRING = { type: "spring", stiffness: 170, damping: 26 } as const;

interface Props {
  breakdown: SimulationBreakdown;
  onFocus: FocusCitation;
  focus: CitationFocus | null;
}

export function WaterfallReceipt({ breakdown, onFocus, focus }: Props) {
  const { totalBillINR: bill, insurerPaysINR, outOfPocketINR, lines } = breakdown;
  const pct = (v: number) => (bill > 0 ? (v / bill) * 100 : 0);
  const [openStep, setOpenStep] = useState<DeductionStep | null>(null);

  return (
    <section aria-labelledby="receipt-title" className="rounded-xl border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="receipt-title" className="text-[15px] font-semibold text-slate-900">
          Claim breakdown
        </h2>
        <span className="text-xs text-slate-500">Open a cut to see the working and its clause</span>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line">
        <Stat label="Hospital bill" value={bill} tone="text-slate-900" />
        <Stat label="Insurer pays" value={insurerPaysINR} tone="text-emerald-600" sub={formatPercent(1 - breakdown.outOfPocketPercent)} />
        <Stat label="You pay" value={outOfPocketINR} tone="text-red-600" sub={formatPercent(breakdown.outOfPocketPercent)} />
      </div>

      {/* Stacked bar */}
      <div className="mt-5">
        <div
          className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`Insurer pays ${formatINR(insurerPaysINR)}, you pay ${formatINR(outOfPocketINR)}`}
        >
          <motion.div className="h-full rounded-l-full bg-emerald-500" animate={{ width: `${pct(insurerPaysINR)}%` }} transition={SPRING} />
          {lines.map((l) => (
            <motion.button
              key={l.step}
              type="button"
              title={`${l.title}: −${formatINR(l.amountDeductedINR)}`}
              aria-label={`${l.title}: −${formatINR(l.amountDeductedINR)}`}
              onClick={() => onFocus(l.citation, l.title, l.amountDeductedINR)}
              className="h-full transition-opacity last:rounded-r-full hover:opacity-80"
              style={{ backgroundColor: STEP_META[l.step].color }}
              animate={{ width: `${pct(l.amountDeductedINR)}%` }}
              transition={SPRING}
            />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Insurer pays
          </span>
          {lines.map((l) => (
            <span key={l.step} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: STEP_META[l.step].color }} />
              {STEP_META[l.step].label} {formatPercent(l.amountDeductedINR / Math.max(1, bill))}
            </span>
          ))}
        </div>
      </div>

      {/* Itemized lines */}
      <ol className="mt-5 divide-y divide-line overflow-hidden rounded-lg border border-line">
        <li className="flex items-center justify-between bg-slate-50 px-4 py-2.5 text-[13px]">
          <span className="text-slate-600">Total hospital bill</span>
          <span className="font-semibold text-slate-900">{formatINR(bill)}</span>
        </li>
        <AnimatePresence initial={false}>
          {lines.length === 0 && (
            <motion.li
              key="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-5 text-center text-[13px] text-emerald-700"
            >
              No cuts. This claim is paid in full under the policy rules.
            </motion.li>
          )}
          {lines.map((line) => {
            const meta = STEP_META[line.step];
            const Icon = meta.icon;
            const active = focus?.citation === line.citation && focus.context === line.title;
            const open = openStep === line.step;
            return (
              <motion.li
                key={line.step}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={`transition-colors duration-200 ${active ? "bg-amber-50/70" : "bg-white"}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenStep(open ? null : line.step)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80"
                >
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{line.title}</span>
                  <span className="num shrink-0 text-[13px] font-semibold text-red-600">−{formatINR(line.amountDeductedINR)}</span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="pb-4 pl-14 pr-4">
                        <code className="block break-words rounded-md bg-slate-50 px-2 py-1 font-mono text-[11.5px] text-slate-700 ring-1 ring-inset ring-slate-100">
                          {line.formulaUsed}
                        </code>
                        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{line.explanation}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onFocus(line.citation, line.title, line.amountDeductedINR)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                              active
                                ? "border-amber-300 bg-amber-100 text-amber-900"
                                : "border-line text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <FileText className="size-3.5" aria-hidden /> See clause · page {line.citation.pageNumber}
                          </button>
                          <span className="text-xs text-slate-500">
                            Left to pay: <span className="num font-medium text-slate-700">{formatINR(line.runningEligibleINR)}</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
        <li className="flex items-center justify-between bg-emerald-50 px-4 py-3 text-[13px]">
          <span className="font-medium text-emerald-800">Insurer pays</span>
          <AnimatedINR value={insurerPaysINR} className="text-[15px] font-semibold text-emerald-700" />
        </li>
      </ol>

      {breakdown.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3">
          {breakdown.notes.map((n) => (
            <li key={n} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden /> {n}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: number; tone: string; sub?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <AnimatedINR value={value} className={`text-lg font-semibold tracking-tight sm:text-xl ${tone}`} />
        {sub && <span className="text-xs text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}
