import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CornerDownLeft, Sparkles } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { resolveDailyCap } from "../engine/claimSimulator";
import { formatINR, formatINRShort, formatPercent } from "../engine/format";
import { parseScenario, type ParsedChip } from "../engine/scenarioParser";
import type { ExtractedPolicyRules } from "../types/policy";
import { PROCEDURE_TYPES, type ClaimScenario, type ProcedureType } from "../types/simulation";

export interface SimulatorState {
  scenario: ClaimScenario;
  consumablesAuto: boolean;
  /** Medicines + implants + tests track the bill at the procedure's typical share. */
  exemptAuto: boolean;
}

export interface SimulatorAutoFlags {
  consumablesAuto?: boolean;
  exemptAuto?: boolean;
}

interface Props {
  rules: ExtractedPolicyRules;
  state: SimulatorState;
  onChange: (patch: Partial<ClaimScenario>, opts?: SimulatorAutoFlags) => void;
  highlight: number; // bumps when a trap is loaded, to flash the panel
}

const EXAMPLES = [
  "Knee surgery in month 18, 4 days in a ₹9,000 room, total bill ₹3.5L",
  "ICU for 5 days at 12k per day, bill of 5 lakh, my 65 year old father in Mumbai",
  "Cataract 2 years into the policy, diabetic, cost Rs 65,000",
];

const REST_SHADOW = "0 0 0 1px #e4e7ec";

export function Simulator({ rules, state, onChange, highlight }: Props) {
  const { scenario, consumablesAuto, exemptAuto } = state;
  const icu = scenario.procedureType === "Cardiac / ICU";
  const cap = resolveDailyCap(rules, icu);
  const consumablesPct = scenario.totalHospitalBillINR > 0 ? scenario.consumablesBillINR / scenario.totalHospitalBillINR : 0;
  const exemptPct = scenario.totalHospitalBillINR > 0 ? scenario.exemptMedicalCostsINR / scenario.totalHospitalBillINR : 0;
  const proportionate = rules.roomRentRule.proportionateDeductionApplies;

  return (
    <motion.section
      key={highlight}
      initial={highlight ? { boxShadow: "0 0 0 3px rgb(15 23 42 / 0.18)" } : false}
      animate={{ boxShadow: REST_SHADOW }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      style={{ boxShadow: REST_SHADOW }}
      aria-labelledby="sim-title"
      className="rounded-xl bg-white p-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sim-title" className="text-[15px] font-semibold text-slate-900">
          Claim simulator
        </h2>
        <span className="text-xs text-slate-500">Worked out from the policy rules, not guessed by AI</span>
      </div>

      <ScenarioBar
        onApply={(patch) =>
          onChange(patch, patch.totalHospitalBillINR !== undefined ? { consumablesAuto: true, exemptAuto: true } : undefined)
        }
      />

      <Group title="Hospital stay">
          <Field label="Treatment">
            <select
              value={scenario.procedureType}
              onChange={(e) => onChange({ procedureType: e.target.value as ProcedureType })}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-slate-900 outline-none transition-shadow focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5"
            >
              {PROCEDURE_TYPES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Slider
            label="Total hospital bill"
            min={50000}
            max={1500000}
            step={5000}
            value={scenario.totalHospitalBillINR}
            display={formatINR(scenario.totalHospitalBillINR)}
            ticks={[formatINRShort(50000), formatINRShort(1500000)]}
            onChange={(v) => onChange({ totalHospitalBillINR: v })}
          />
          <Slider
            label={icu ? "ICU charge per day" : "Room rent per day"}
            min={3000}
            max={15000}
            step={500}
            value={scenario.actualDailyRoomRentINR}
            display={formatINR(scenario.actualDailyRoomRentINR)}
            hint={
              cap.capINR === null
                ? "No limit in this policy"
                : scenario.actualDailyRoomRentINR > cap.capINR
                  ? `Above the ${formatINR(cap.capINR)} limit`
                  : `Within the ${formatINR(cap.capINR)} limit`
            }
            hintTone={cap.capINR !== null && scenario.actualDailyRoomRentINR > cap.capINR ? "bad" : "ok"}
            marker={cap.capINR !== null ? { value: cap.capINR, label: "limit" } : undefined}
            ticks={["₹3k", "₹15k"]}
            onChange={(v) => onChange({ actualDailyRoomRentINR: v })}
          />
          <Slider
            label={icu ? "Days in ICU" : "Days in hospital"}
            min={1}
            max={30}
            step={1}
            value={scenario.daysInRoom}
            display={`${scenario.daysInRoom} ${scenario.daysInRoom === 1 ? "day" : "days"}`}
            ticks={["1", "30"]}
            onChange={(v) => onChange({ daysInRoom: v })}
          />
      </Group>

      <Group title="Patient and policy">
          <Slider
            label="Policy age"
            min={1}
            max={60}
            step={1}
            value={scenario.policyAgeMonths}
            display={`${scenario.policyAgeMonths} months`}
            marker={{ value: rules.waitingPeriods.specificDiseasesMonths, label: `${rules.waitingPeriods.specificDiseasesMonths} mo` }}
            ticks={["1 mo", "60 mo"]}
            onChange={(v) => onChange({ policyAgeMonths: v })}
          />
          <Slider
            label="Patient age"
            min={18}
            max={85}
            step={1}
            value={scenario.patientAgeYears ?? 35}
            display={`${scenario.patientAgeYears ?? 35} years`}
            marker={rules.coPayRule.ageTriggerYears !== null ? { value: rules.coPayRule.ageTriggerYears, label: "co-pay" } : undefined}
            ticks={["18", "85"]}
            onChange={(v) => onChange({ patientAgeYears: v })}
          />
          <div className="flex flex-wrap gap-x-8 md:col-span-2">
            <Toggle label="Pre-existing condition" checked={scenario.isPreExisting} onChange={(v) => onChange({ isPreExisting: v })} />
          <Toggle
            label="Metro hospital"
            checked={scenario.treatedInHigherZone ?? false}
            onChange={(v) => onChange({ treatedInHigherZone: v })}
          />
          </div>
      </Group>

      <details className="group mt-6 border-t border-line pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] [&::-webkit-details-marker]:hidden">
          <span className="font-medium text-slate-900">Bill details</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
            <span className="num truncate">
              Consumables {formatINR(scenario.consumablesBillINR)} · Medicines, implants & tests {formatINR(scenario.exemptMedicalCostsINR)}
            </span>
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <Slider
            label="Consumables (gloves, PPE, kits)"
            min={0}
            max={0.2}
            step={0.005}
            value={consumablesPct}
            display={`${formatINR(scenario.consumablesBillINR)} · ${formatPercent(consumablesPct)}`}
            hint={
              rules.nonMedicalConsumablesCovered.isCovered
                ? "Covered by this policy"
                : consumablesAuto
                  ? "Typical share · not covered"
                  : "Not covered"
            }
            hintTone={rules.nonMedicalConsumablesCovered.isCovered ? "ok" : "bad"}
            ticks={["0%", "20%"]}
            onChange={(v) => onChange({ consumablesBillINR: Math.round(v * scenario.totalHospitalBillINR) }, { consumablesAuto: false })}
            extra={!consumablesAuto ? <ResetButton onClick={() => onChange({}, { consumablesAuto: true })} /> : null}
          />
          <Slider
            label="Medicines, implants & tests"
            min={0}
            max={0.6}
            step={0.01}
            value={exemptPct}
            display={`${formatINR(scenario.exemptMedicalCostsINR)} · ${formatPercent(exemptPct)}`}
            hint={
              !proportionate
                ? "No proportionate cut in this policy"
                : icu
                  ? "ICU is never cut in proportion"
                  : exemptAuto
                    ? "Typical share · always paid in full"
                    : "Always paid in full"
            }
            hintTone="ok"
            ticks={["0%", "60%"]}
            onChange={(v) => onChange({ exemptMedicalCostsINR: Math.round(v * scenario.totalHospitalBillINR) }, { exemptAuto: false })}
            extra={!exemptAuto ? <ResetButton onClick={() => onChange({}, { exemptAuto: true })} /> : null}
          />
        </div>
      </details>
    </motion.section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-4 text-[13px] font-medium text-slate-900">{title}</h3>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">{children}</div>
    </div>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">
      Reset
    </button>
  );
}

function ScenarioBar({ onApply }: { onApply: (patch: Partial<ClaimScenario>) => void }) {
  const [text, setText] = useState("");
  const [chips, setChips] = useState<ParsedChip[] | null>(null);

  const apply = (value: string) => {
    const { patch, chips } = parseScenario(value);
    setChips(chips);
    if (chips.length) onApply(patch);
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(text);
        }}
        className="flex items-center gap-2 rounded-lg border border-line bg-white py-1.5 pl-3 pr-1.5 transition-shadow focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-900/5"
      >
        <Sparkles className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a hospital stay in plain words…"
          aria-label="Describe a claim scenario in plain English"
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
        />
        <button
          type="submit"
          className="flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700"
        >
          Apply <CornerDownLeft className="size-3" aria-hidden />
        </button>
      </form>
      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
        <AnimatePresence mode="popLayout">
          {chips === null
            ? EXAMPLES.map((ex) => (
                <motion.button
                  key={ex}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  type="button"
                  onClick={() => {
                    setText(ex);
                    apply(ex);
                  }}
                  className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
                >
                  {ex}
                </motion.button>
              ))
            : chips.length === 0
              ? (
                  <motion.span key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-amber-700">
                    Couldn't read that. Try amounts like "₹3.5L bill", "4 days", "₹9,000 room", "month 18".
                  </motion.span>
                )
              : chips.map((c) => (
                  <motion.span
                    key={c.label}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-800"
                  >
                    <span className="text-slate-500">{c.label}:</span> {c.value}
                  </motion.span>
                ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-2 text-[13px] text-slate-700">
      <span className="relative inline-flex">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-5 w-9 rounded-full bg-slate-200 transition-colors duration-200 peer-checked:bg-slate-900 peer-focus-visible:ring-4 peer-focus-visible:ring-slate-900/10" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
  hint?: string;
  hintTone?: "ok" | "bad";
  marker?: { value: number; label: string };
  ticks?: [string, string];
  extra?: ReactNode;
}

function Slider({ label, min, max, step, value, display, onChange, hint, hintTone, marker, ticks, extra }: SliderProps) {
  const id = useId();
  const clamped = Math.min(max, Math.max(min, value));
  const fill = ((clamped - min) / (max - min)) * 100;
  const markerPos = marker ? ((Math.min(max, Math.max(min, marker.value)) - min) / (max - min)) * 100 : null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] text-slate-600">
          {label}
        </label>
        <span className="num text-[13px] font-semibold text-slate-900">{display}</span>
      </div>
      <div className="relative py-1.5">
        <input
          id={id}
          type="range"
          className="slider block"
          min={min}
          max={max}
          step={step}
          value={clamped}
          style={{ ["--fill" as string]: `${fill}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {markerPos !== null && marker && marker.value >= min && marker.value <= max && (
          <span className="pointer-events-none absolute top-0 h-4 w-0.5 rounded-full bg-amber-500" style={{ left: `${markerPos}%` }} aria-hidden>
            <span className="absolute left-1/2 top-4.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-amber-700">{marker.label}</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>{ticks?.[0]}</span>
        <span className="flex items-center gap-2 text-center">
          {hint && <span className={hintTone === "bad" ? "text-red-600" : "text-emerald-700"}>{hint}</span>}
          {extra}
        </span>
        <span>{ticks?.[1]}</span>
      </div>
    </div>
  );
}
