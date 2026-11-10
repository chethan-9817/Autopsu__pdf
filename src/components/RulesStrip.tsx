import { ChevronRight } from "lucide-react";
import { resolveDailyCap } from "../engine/claimSimulator";
import { formatINR, formatPercent } from "../engine/format";
import type { BoundingBoxCitation, ExtractedPolicyRules } from "../types/policy";
import type { FocusCitation } from "./focus";

/** The extracted rule set at a glance; every row opens its clause. */
export function RulesStrip({ rules, onFocus }: { rules: ExtractedPolicyRules; onFocus: FocusCitation }) {
  const room = resolveDailyCap(rules, false);
  const icu = resolveDailyCap(rules, true);
  const cp = rules.coPayRule;
  const wp = rules.waitingPeriods;

  const facts: Array<{ label: string; value: string; bad: boolean; citation: BoundingBoxCitation }> = [
    {
      label: "Room rent limit",
      value:
        room.capINR === null
          ? "No limit"
          : `${formatINR(room.capINR)}/day · ICU ${icu.capINR === null ? "no limit" : formatINR(icu.capINR)}`,
      bad: room.capINR !== null,
      citation: rules.roomRentRule.citation,
    },
    {
      label: "Co-pay",
      value:
        cp.mandatoryCoPayPercent === 0 && cp.zonalCoPayPercent === 0
          ? "None"
          : [
              cp.mandatoryCoPayPercent > 0
                ? `${formatPercent(cp.mandatoryCoPayPercent)}${cp.ageTriggerYears !== null ? ` from age ${cp.ageTriggerYears}` : " on every claim"}`
                : null,
              cp.zonalCoPayPercent > 0 ? `+${formatPercent(cp.zonalCoPayPercent)} in metros` : null,
            ]
              .filter(Boolean)
              .join(" "),
      bad: cp.mandatoryCoPayPercent > 0 && cp.ageTriggerYears === null,
      citation: cp.citation,
    },
    {
      label: "Waiting periods",
      value: `${wp.initialWaitingDays} days · listed illnesses ${wp.specificDiseasesMonths} mo · pre-existing ${wp.preExistingDiseasesMonths} mo`,
      bad: wp.specificDiseasesMonths >= 24 || wp.preExistingDiseasesMonths >= 36,
      citation: wp.citation,
    },
    {
      label: "Consumables",
      value: rules.nonMedicalConsumablesCovered.isCovered ? "Covered" : "Not covered",
      bad: !rules.nonMedicalConsumablesCovered.isCovered,
      citation: rules.nonMedicalConsumablesCovered.citation,
    },
  ];

  return (
    <section aria-label="Policy summary" className="rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{rules.policyName}</h2>
          <p className="text-[13px] text-slate-500">{rules.insurerName}</p>
        </div>
        <div className="sm:text-right">
          <div className="text-xs text-slate-500">Sum insured</div>
          <div className="text-[15px] font-semibold text-slate-900">{formatINR(rules.baseSumInsured)}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2">
        {facts.map((f, i) => (
          <button
            key={f.label}
            type="button"
            onClick={() => onFocus(f.citation, f.label)}
            title={`Show ${f.citation.clauseId} (page ${f.citation.pageNumber})`}
            className={`group flex items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 ${
              i >= 2 ? "border-t border-line" : i === 1 ? "border-t border-line sm:border-t-0" : ""
            } ${i % 2 === 1 ? "sm:border-l sm:border-line" : ""}`}
          >
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${f.bad ? "bg-red-500" : "bg-emerald-500"}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-slate-500">{f.label}</span>
              <span className="block text-[13px] font-medium text-slate-800">{f.value}</span>
            </span>
            <ChevronRight className="mt-2 size-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" aria-hidden />
          </button>
        ))}
      </div>

      {rules.subLimits.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line px-5 py-3">
          <span className="mr-1 text-xs text-slate-500">Treatment caps</span>
          {rules.subLimits.map((s) => (
            <button
              key={s.procedureName}
              type="button"
              onClick={() => onFocus(s.citation, `Treatment cap: ${s.procedureName}`)}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              {s.procedureName.split(/[ (/]/)[0]} {formatINR(s.maxCapINR)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
