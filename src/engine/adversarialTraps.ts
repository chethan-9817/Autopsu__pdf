/**
 * Runs every policy through three fixed adversarial claim templates the moment
 * it loads. Pure and deterministic: it only builds scenarios and calls the
 * simulator, so the trap numbers always match what the simulator shows.
 */
import type { BoundingBoxCitation, ExtractedPolicyRules } from "../types/policy";
import type { ClaimScenario, DeductionStep, SimulationBreakdown } from "../types/simulation";
import { EXEMPT_COST_SHARE, estimateConsumables, estimateExemptCosts, resolveDailyCap, simulateHospitalClaim } from "./claimSimulator";
import { formatINR, formatINRShort, formatPercent } from "./format";

export type TrapId = "metro-room" | "year2-surgery" | "copay-consumables";
export type TrapSeverity = "critical" | "warning" | "clear";

export interface TrapResult {
  id: TrapId;
  rank: number;
  title: string;
  scenarioLabel: string;
  scenario: ClaimScenario;
  breakdown: SimulationBreakdown;
  /** Rupees lost to the mechanism this trap targets (not every cut on the bill). */
  headlineINR: number;
  headlinePercent: number;
  headlineLabel: string;
  severity: TrapSeverity;
  insight: string;
  citation: BoundingBoxCitation;
  assumptions: string[];
}

function severityFor(fraction: number): TrapSeverity {
  if (fraction >= 0.2) return "critical";
  if (fraction >= 0.05) return "warning";
  return "clear";
}

function sumSteps(b: SimulationBreakdown, steps: DeductionStep[]): number {
  return b.lines.filter((l) => steps.includes(l.step)).reduce((s, l) => s + l.amountDeductedINR, 0);
}

/** Trap #1: ₹3.5L surgery, 4 days in a ₹8,500/day metro single-AC room. */
function metroRoomTrap(rules: ExtractedPolicyRules): TrapResult {
  const bill = 350000;
  const scenario: ClaimScenario = {
    procedureType: "General Hospitalization",
    isPreExisting: false,
    policyAgeMonths: 36,
    daysInRoom: 4,
    actualDailyRoomRentINR: 8500,
    totalHospitalBillINR: bill,
    consumablesBillINR: estimateConsumables(rules, bill),
    exemptMedicalCostsINR: estimateExemptCosts("General Hospitalization", bill),
    patientAgeYears: 35,
    treatedInHigherZone: false,
  };
  const breakdown = simulateHospitalClaim(rules, scenario);
  const loss = sumSteps(breakdown, ["ROOM_RENT_EXCESS", "PROPORTIONATE_DEDUCTION"]);
  const proportionate = sumSteps(breakdown, ["PROPORTIONATE_DEDUCTION"]);
  const cap = resolveDailyCap(rules, false);
  const insight =
    loss === 0
      ? cap.capINR === null
        ? `No room-rent cap (${cap.label}): a ₹8,500 room costs you nothing extra.`
        : `The ₹8,500 room is within the ${formatINR(cap.capINR)}/day limit.`
      : proportionate > 0
        ? `Room is ${formatINR(8500 - (cap.capINR ?? 0))}/day over the ${formatINR(cap.capINR ?? 0)} cap. The excess rent is only ${formatINR(loss - proportionate)}, but proportionate deduction then cuts ${formatINR(proportionate)} off surgeon, OT and nursing charges. Medicines, implants and tests are protected by IRDAI.`
        : `Room is over the ${formatINR(cap.capINR ?? 0)}/day cap: you pay the ${formatINR(loss)} difference.`;
  return {
    id: "metro-room",
    rank: 1,
    title: "A private room above the limit",
    scenarioLabel: "₹3.5L surgery · 4 days · ₹8,500/day single AC room",
    scenario,
    breakdown,
    headlineINR: loss,
    headlinePercent: loss / bill,
    headlineLabel: "lost to the room limit",
    severity: severityFor(loss / bill),
    insight,
    citation: rules.roomRentRule.citation,
    assumptions: [
      "Not pre-existing, policy in year 4",
      "Patient age 35, treated in premium zone",
      "Consumables at policy estimate",
      `Medicines, implants and tests ${formatPercent(EXEMPT_COST_SHARE["General Hospitalization"])} of bill (exempt from proportionate cut)`,
    ],
  };
}

/** Trap #2: a "slow-developing" surgery at month 18. Tests knee and cataract, reports the worse one. */
function year2SurgeryTrap(rules: ExtractedPolicyRules): TrapResult {
  const templates: ClaimScenario[] = [
    {
      procedureType: "Knee Replacement",
      isPreExisting: false,
      policyAgeMonths: 18,
      daysInRoom: 4,
      actualDailyRoomRentINR: 4500,
      totalHospitalBillINR: 300000,
      consumablesBillINR: 0,
      exemptMedicalCostsINR: 0,
      patientAgeYears: 52,
      treatedInHigherZone: false,
    },
    {
      procedureType: "Cataract",
      isPreExisting: false,
      policyAgeMonths: 18,
      daysInRoom: 1,
      actualDailyRoomRentINR: 3000,
      totalHospitalBillINR: 65000,
      consumablesBillINR: 0,
      exemptMedicalCostsINR: 0,
      patientAgeYears: 52,
      treatedInHigherZone: false,
    },
  ];
  const candidates = templates.map((s) => ({
    ...s,
    consumablesBillINR: estimateConsumables(rules, s.totalHospitalBillINR),
    exemptMedicalCostsINR: estimateExemptCosts(s.procedureType, s.totalHospitalBillINR),
  }));

  const runs = candidates.map((scenario) => {
    const breakdown = simulateHospitalClaim(rules, scenario);
    const loss = sumSteps(breakdown, ["WAITING_PERIOD", "SUB_LIMIT"]);
    return { scenario, breakdown, loss, pct: loss / scenario.totalHospitalBillINR };
  });
  const worst = runs.reduce((a, b) => (b.pct > a.pct ? b : a));
  const { scenario, breakdown, loss, pct } = worst;

  // What happens the month after the waiting period ends? (the "sub-limit cliff")
  const after = simulateHospitalClaim(rules, {
    ...scenario,
    policyAgeMonths: Math.max(scenario.policyAgeMonths, rules.waitingPeriods.specificDiseasesMonths) + 1,
  });
  const afterSubLimit = after.lines.find((l) => l.step === "SUB_LIMIT");
  const subLimitLine = breakdown.lines.find((l) => l.step === "SUB_LIMIT");

  const name = scenario.procedureType;
  let insight: string;
  if (breakdown.rejected) {
    insight = `${name} at month 18 is rejected outright: it sits on the ${rules.waitingPeriods.specificDiseasesMonths}-month specific-disease list.`;
    if (afterSubLimit) insight += ` Even after month ${rules.waitingPeriods.specificDiseasesMonths}, the ${afterSubLimit.title.replace("Sub-limit: ", "")} sub-limit still chops ${formatINR(afterSubLimit.amountDeductedINR)}.`;
  } else if (subLimitLine) {
    insight = `Waiting period cleared, but a sub-limit chops ${formatINR(subLimitLine.amountDeductedINR)} off the ${formatINRShort(scenario.totalHospitalBillINR)} bill.`;
  } else {
    insight = `Waiting period is ${rules.waitingPeriods.specificDiseasesMonths} months, so a month-18 ${name.toLowerCase()} claim is payable with no sub-limit cliff.`;
  }

  return {
    id: "year2-surgery",
    rank: 2,
    title: "Planned surgery in year 2",
    scenarioLabel: `${name} at month 18 · ${formatINRShort(scenario.totalHospitalBillINR)} bill`,
    scenario,
    breakdown,
    headlineINR: loss,
    headlinePercent: pct,
    headlineLabel: breakdown.rejected ? "rejected by the waiting period" : "lost to waiting period and treatment cap",
    severity: severityFor(pct),
    insight,
    citation: breakdown.rejected || !subLimitLine ? rules.waitingPeriods.citation : subLimitLine.citation,
    assumptions: ["Tested Knee Replacement (₹3L) and Cataract (₹65k); worse one shown", "No prior history of the condition"],
  };
}

/** Trap #3: ₹5L ICU bill with the ICU rate inside the cap: consumables + co-pay only. */
function copayConsumablesTrap(rules: ExtractedPolicyRules): TrapResult {
  const bill = 500000;
  const cap = resolveDailyCap(rules, true);
  const icuRate = cap.capINR === null ? 10000 : Math.min(cap.capINR, 10000);
  const age = Math.max(61, rules.coPayRule.ageTriggerYears ?? 0);
  const scenario: ClaimScenario = {
    procedureType: "Cardiac / ICU",
    isPreExisting: false,
    policyAgeMonths: 36,
    daysInRoom: 5,
    actualDailyRoomRentINR: icuRate,
    totalHospitalBillINR: bill,
    consumablesBillINR: estimateConsumables(rules, bill),
    exemptMedicalCostsINR: estimateExemptCosts("Cardiac / ICU", bill),
    patientAgeYears: age,
    treatedInHigherZone: true,
  };
  const breakdown = simulateHospitalClaim(rules, scenario);
  const consumables = sumSteps(breakdown, ["CONSUMABLES"]);
  const copay = sumSteps(breakdown, ["CO_PAY"]);
  const loss = consumables + copay;
  const others = breakdown.outOfPocketINR - loss;

  const parts: string[] = [];
  parts.push(consumables > 0 ? `${formatINR(consumables)} in non-payable consumables` : "consumables are covered");
  parts.push(copay > 0 ? `${formatINR(copay)} in co-pay` : "no co-pay applies");
  let insight = `ICU billed at ${formatINR(icuRate)}/day, inside the limit. Still: ${parts.join(" and ")}.`;
  if (others > 0) insight += ` Other cuts (sub-limits etc.) add ${formatINR(others)} more.`;

  const copayLine = breakdown.lines.find((l) => l.step === "CO_PAY");
  const consumablesLine = breakdown.lines.find((l) => l.step === "CONSUMABLES");
  const citation =
    copay >= consumables && copayLine
      ? copayLine.citation
      : consumablesLine?.citation ?? rules.coPayRule.citation;

  return {
    id: "copay-consumables",
    rank: 3,
    title: "Co-pay and consumables on a big bill",
    scenarioLabel: `₹5L ICU bill · 5 days · age ${age} · metro hospital`,
    scenario,
    breakdown,
    headlineINR: loss,
    headlinePercent: loss / bill,
    headlineLabel: "lost to consumables and co-pay",
    severity: severityFor(loss / bill),
    insight,
    citation,
    assumptions: [`ICU rate ${formatINR(icuRate)}/day (within cap)`, `Patient age ${age}`, "Treated in a Zone A metro hospital", `Consumables ${formatPercent(scenario.consumablesBillINR / bill)} of bill`],
  };
}

export function runAdversarialTraps(rules: ExtractedPolicyRules): TrapResult[] {
  return [metroRoomTrap(rules), year2SurgeryTrap(rules), copayConsumablesTrap(rules)];
}
