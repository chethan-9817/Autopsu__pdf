/**
 * Deterministic actuarial engine. ZERO LLM involvement: same rules + same
 * scenario always produce the same receipt, down to the rupee.
 *
 * Order of operations (each step works on what the previous step left payable):
 *   1. Waiting-period gatekeeper (initial / pre-existing / specific disease) -> 100% rejection
 *   2. Non-medical consumables cut
 *   3. Room-rent excess + proportionate deduction on associated medical expenses
 *      (IRDAI 2020: never on medicines, implants/devices, diagnostics or ICU charges)
 *   4. Procedure sub-limit chop
 *   5. Mandatory + zonal co-pay
 *   6. Sum-insured cap
 *
 * Every deduction is rounded to the nearest rupee once, and the payout is the
 * bill minus the sum of those rounded lines, so the receipt always adds up.
 */
import type { BoundingBoxCitation, ExtractedPolicyRules } from "../types/policy";
import type {
  ClaimScenario,
  DeductionLine,
  DeductionStep,
  ProcedureType,
  SimulationBreakdown,
} from "../types/simulation";
import { formatINR, formatPercent } from "./format";
import { findSpecificDisease, findSubLimit } from "./procedureMatching";

export const DEFAULT_PATIENT_AGE = 35;
const DAYS_PER_MONTH = 30;

export interface DailyCap {
  capINR: number | null; // null = no numeric cap
  label: string; // how the cap was derived, for formulas
}

/** Resolves the daily room (or ICU) cap from the extracted rule. */
export function resolveDailyCap(rules: ExtractedPolicyRules, icu: boolean): DailyCap {
  const r = rules.roomRentRule;
  const si = rules.baseSumInsured;
  if (icu) {
    switch (r.icuLimitType) {
      case "PERCENT_OF_SI":
        return { capINR: Math.round(si * r.icuLimitValue), label: `${formatPercent(r.icuLimitValue)} of SI ${formatINR(si)}` };
      case "FLAT_CAP":
        return { capINR: Math.round(r.icuLimitValue), label: `flat ICU cap` };
      case "NO_CAP":
        return { capINR: null, label: "no ICU cap" };
    }
  }
  switch (r.limitType) {
    case "PERCENT_OF_SI": {
      const cap = r.MaxDailyRoomRentINR > 0 ? r.MaxDailyRoomRentINR : Math.round(si * r.limitValue);
      return { capINR: cap, label: `${formatPercent(r.limitValue)} of SI ${formatINR(si)}` };
    }
    case "FLAT_CAP":
      return { capINR: r.MaxDailyRoomRentINR > 0 ? r.MaxDailyRoomRentINR : Math.round(r.limitValue), label: "flat room cap" };
    case "SINGLE_PRIVATE_AC":
      return r.MaxDailyRoomRentINR > 0
        ? { capINR: r.MaxDailyRoomRentINR, label: "single private AC room rate" }
        : { capINR: null, label: "single private AC room (assumed chosen)" };
    case "NO_CAP":
      return { capINR: null, label: "no room-rent cap" };
  }
}

function clampNumber(value: number, min: number, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitize(input: ClaimScenario, notes: string[]): ClaimScenario {
  const bill = Math.round(clampNumber(input.totalHospitalBillINR, 0));
  const days = Math.round(clampNumber(input.daysInRoom, 0, 365));
  const rent = Math.round(clampNumber(input.actualDailyRoomRentINR, 0));
  let consumables = Math.round(clampNumber(input.consumablesBillINR, 0));
  if (consumables > bill) {
    notes.push(`Consumables (${formatINR(consumables)}) exceeded the bill; capped at ${formatINR(bill)}.`);
    consumables = bill;
  }
  if (rent * days > bill) {
    notes.push(`Room rent × days (${formatINR(rent * days)}) is more than the whole bill; associated medical expenses treated as ₹0.`);
  }
  let exempt = Math.round(clampNumber(input.exemptMedicalCostsINR, 0));
  if (exempt > bill - consumables) {
    notes.push(`Medicines, implants and tests (${formatINR(exempt)}) exceeded the bill minus consumables; capped at ${formatINR(bill - consumables)}.`);
    exempt = bill - consumables;
  }
  return {
    ...input,
    totalHospitalBillINR: bill,
    daysInRoom: days,
    actualDailyRoomRentINR: rent,
    consumablesBillINR: consumables,
    exemptMedicalCostsINR: exempt,
    policyAgeMonths: Math.round(clampNumber(input.policyAgeMonths, 0, 600)),
    patientAgeYears: Math.round(clampNumber(input.patientAgeYears ?? DEFAULT_PATIENT_AGE, 0, 120)),
    treatedInHigherZone: input.treatedInHigherZone ?? false,
  };
}

export function simulateHospitalClaim(
  rules: ExtractedPolicyRules,
  scenario: ClaimScenario,
): SimulationBreakdown {
  const notes: string[] = [];
  const s = sanitize(scenario, notes);
  const bill = s.totalHospitalBillINR;
  const lines: DeductionLine[] = [];
  let eligible = bill;

  const deduct = (
    step: DeductionStep,
    title: string,
    rawAmount: number,
    formulaUsed: string,
    explanation: string,
    citation: BoundingBoxCitation,
  ) => {
    const amount = Math.min(eligible, Math.max(0, Math.round(rawAmount)));
    if (amount <= 0) return;
    eligible -= amount;
    lines.push({
      id: `${step}-${lines.length}`,
      step,
      title,
      amountDeductedINR: amount,
      formulaUsed,
      explanation,
      citation,
      runningEligibleINR: eligible,
    });
  };

  // ── Step 1: waiting-period gatekeeper ────────────────────────────────────
  const wp = rules.waitingPeriods;
  const policyDays = s.policyAgeMonths * DAYS_PER_MONTH;
  const specificDisease = findSpecificDisease(s.procedureType, wp.specificDiseasesList);
  let rejection: { title: string; formula: string; why: string } | null = null;

  if (policyDays < wp.initialWaitingDays) {
    rejection = {
      title: "Initial waiting period: claim rejected",
      formula: `${s.policyAgeMonths} mo × ${DAYS_PER_MONTH} = ${policyDays} days < ${wp.initialWaitingDays}-day initial waiting period → 100% rejected`,
      why: `Illness claims in the first ${wp.initialWaitingDays} days of the policy are not payable.`,
    };
  } else if (s.isPreExisting && s.policyAgeMonths < wp.preExistingDiseasesMonths) {
    rejection = {
      title: "Pre-existing disease waiting period: claim rejected",
      formula: `Policy age ${s.policyAgeMonths} mo < PED waiting ${wp.preExistingDiseasesMonths} mo → 100% rejected`,
      why: `A declared pre-existing condition is only covered after ${wp.preExistingDiseasesMonths} months of continuous cover. You are ${wp.preExistingDiseasesMonths - s.policyAgeMonths} months short.`,
    };
  } else if (specificDisease && s.policyAgeMonths < wp.specificDiseasesMonths) {
    rejection = {
      title: "Specific-disease waiting period: claim rejected",
      formula: `"${specificDisease}" is on the ${wp.specificDiseasesMonths}-month list; policy age ${s.policyAgeMonths} mo < ${wp.specificDiseasesMonths} mo → 100% rejected`,
      why: `${s.procedureType} falls under the slow-developing "specific diseases" list. It is excluded until month ${wp.specificDiseasesMonths}, even if you never had the condition before.`,
    };
  }

  if (rejection) {
    deduct("WAITING_PERIOD", rejection.title, bill, rejection.formula, rejection.why, wp.citation);
    return finalize(s, bill, eligible, lines, notes, true);
  }

  // ── Step 2: non-medical consumables ──────────────────────────────────────
  const nmc = rules.nonMedicalConsumablesCovered;
  if (!nmc.isCovered && s.consumablesBillINR > 0) {
    deduct(
      "CONSUMABLES",
      "Non-medical consumables excluded",
      s.consumablesBillINR,
      `Gloves, PPE, syringes, nebuliser kits, etc. = ${formatINR(s.consumablesBillINR)} (${formatPercent(s.consumablesBillINR / Math.max(1, bill))} of bill) → −${formatINR(s.consumablesBillINR)}`,
      "These items are on the IRDAI list of non-payable items and this policy has no consumables cover, so they come straight out of your pocket.",
      nmc.citation,
    );
  }

  // ── Step 3: room rent excess + proportionate deduction ───────────────────
  const icu = s.procedureType === "Cardiac / ICU";
  const roomWord = icu ? "ICU" : "room";
  const cap = resolveDailyCap(rules, icu);
  const totalRoomRent = s.actualDailyRoomRentINR * s.daysInRoom;
  const rr = rules.roomRentRule;

  if (cap.capINR !== null && s.actualDailyRoomRentINR > cap.capINR && s.daysInRoom > 0) {
    const allowed = cap.capINR;
    const actual = s.actualDailyRoomRentINR;
    const excess = (actual - allowed) * s.daysInRoom;
    deduct(
      "ROOM_RENT_EXCESS",
      `${icu ? "ICU" : "Room"} rent above eligible limit`,
      excess,
      `(${formatINR(actual)} − ${formatINR(allowed)}) × ${s.daysInRoom} days = −${formatINR(excess)}`,
      `Eligible ${roomWord} rent is ${formatINR(allowed)}/day (${cap.label}). Everything above it, every day, is yours to pay.`,
      rr.citation,
    );

    if (rr.proportionateDeductionApplies && icu) {
      // IRDAI/HLT/REG/CIR/151/06/2020: no proportionate deduction on ICU charges.
      notes.push("IRDAI does not allow proportionate deduction on ICU charges, so only the ICU rent above the cap is cut.");
    } else if (rr.proportionateDeductionApplies) {
      const ratio = allowed / actual;
      const exempt = s.exemptMedicalCostsINR;
      const associated = Math.max(0, bill - totalRoomRent - s.consumablesBillINR - exempt);
      const slash = associated * (1 - ratio);
      deduct(
        "PROPORTIONATE_DEDUCTION",
        "Proportionate deduction on associated medical expenses",
        slash,
        `${formatINR(associated)} × (1 − ${formatINR(allowed).replace("₹", "")}/${formatINR(actual).replace("₹", "")}) = −${formatINR(Math.round(slash))}`,
        `Because the ${roomWord} cost more than the eligible limit, the insurer pays only ${formatPercent(ratio)} (${formatINR(allowed)} ÷ ${formatINR(actual)}) of every associated charge: surgeon, OT, doctor visits, nursing. Associated expenses = bill ${formatINR(bill)} − ${roomWord} rent ${formatINR(totalRoomRent)} − consumables ${formatINR(s.consumablesBillINR)} − medicines, implants and tests ${formatINR(exempt)}. IRDAI bars proportionate cuts on medicines, implants and diagnostics, so those are paid in full.`,
        rr.citation,
      );
    }
  }

  // ── Step 4: procedure sub-limit ──────────────────────────────────────────
  const subLimit = findSubLimit(s.procedureType, rules.subLimits);
  if (subLimit && eligible > subLimit.maxCapINR) {
    const before = eligible;
    deduct(
      "SUB_LIMIT",
      `Sub-limit: ${subLimit.procedureName}`,
      before - subLimit.maxCapINR,
      `min(${formatINR(before)}, cap ${formatINR(subLimit.maxCapINR)}) → −${formatINR(before - subLimit.maxCapINR)}`,
      `${subLimit.procedureName} is capped at ${formatINR(subLimit.maxCapINR)} no matter what your sum insured is.`,
      subLimit.citation,
    );
  }

  // ── Step 5: mandatory + zonal co-pay ─────────────────────────────────────
  const cp = rules.coPayRule;
  const age = s.patientAgeYears ?? DEFAULT_PATIENT_AGE;
  const mandatoryApplies = cp.mandatoryCoPayPercent > 0 && (cp.ageTriggerYears === null || age >= cp.ageTriggerYears);
  const zonalApplies = cp.zonalCoPayPercent > 0 && s.treatedInHigherZone === true;
  const coPayPct = (mandatoryApplies ? cp.mandatoryCoPayPercent : 0) + (zonalApplies ? cp.zonalCoPayPercent : 0);
  if (coPayPct > 0 && eligible > 0) {
    const parts = [
      mandatoryApplies ? `${formatPercent(cp.mandatoryCoPayPercent)} mandatory` : null,
      zonalApplies ? `${formatPercent(cp.zonalCoPayPercent)} zonal` : null,
    ].filter(Boolean);
    const amount = eligible * coPayPct;
    const whyMandatory = mandatoryApplies
      ? cp.ageTriggerYears === null
        ? `a ${formatPercent(cp.mandatoryCoPayPercent)} co-pay on every claim`
        : `a ${formatPercent(cp.mandatoryCoPayPercent)} co-pay because the patient is ${age} (trigger age ${cp.ageTriggerYears})`
      : null;
    const whyZonal = zonalApplies
      ? `a ${formatPercent(cp.zonalCoPayPercent)} zonal co-pay for treatment in a costlier zone than the premium was priced for`
      : null;
    deduct(
      "CO_PAY",
      "Co-payment (your share)",
      amount,
      `${formatINR(eligible)} × (${parts.join(" + ")}) = −${formatINR(Math.round(amount))}`,
      `The policy charges ${[whyMandatory, whyZonal].filter(Boolean).join(" plus ")}, applied after all other cuts.`,
      cp.citation,
    );
  }

  // ── Step 6: sum insured cap ──────────────────────────────────────────────
  if (eligible > rules.baseSumInsured) {
    const before = eligible;
    deduct(
      "SUM_INSURED_CAP",
      "Sum insured exhausted",
      before - rules.baseSumInsured,
      `min(${formatINR(before)}, SI ${formatINR(rules.baseSumInsured)}) → −${formatINR(before - rules.baseSumInsured)}`,
      `The insurer never pays more than the sum insured of ${formatINR(rules.baseSumInsured)} in a policy year.`,
      sumInsuredCitation(rules),
    );
  }

  return finalize(s, bill, eligible, lines, notes, false);
}

/** The schema has no SI citation, so point at the policy schedule; the viewer locates the quote in the text layer. */
export function sumInsuredCitation(rules: ExtractedPolicyRules): BoundingBoxCitation {
  return {
    pageNumber: 1,
    clauseId: "Policy Schedule - Sum Insured",
    verbatimQuote: `Sum Insured: Rs. ${new Intl.NumberFormat("en-IN").format(rules.baseSumInsured)}`,
  };
}

function finalize(
  scenario: ClaimScenario,
  bill: number,
  eligible: number,
  lines: DeductionLine[],
  notes: string[],
  rejected: boolean,
): SimulationBreakdown {
  const insurerPaysINR = Math.max(0, eligible);
  const outOfPocketINR = bill - insurerPaysINR;
  return {
    scenario,
    totalBillINR: bill,
    insurerPaysINR,
    outOfPocketINR,
    outOfPocketPercent: bill > 0 ? outOfPocketINR / bill : 0,
    rejected,
    lines,
    notes,
  };
}

/**
 * Rough share of an Indian inpatient bill that is medicines, implants / devices and
 * diagnostics, by procedure. Implant-heavy procedures (knee, lens, stents) run higher.
 * These are planning estimates, not insurer data: the slider lets you enter the real figure.
 */
export const EXEMPT_COST_SHARE: Record<ProcedureType, number> = {
  "General Hospitalization": 0.3,
  "Knee Replacement": 0.4,
  Cataract: 0.35,
  "Cardiac / ICU": 0.4,
  "Robotic / Modern Treatment": 0.3,
};

/** Medicines + implants + diagnostics estimate used when the simulator's "auto" toggle is on. */
export function estimateExemptCosts(procedure: ProcedureType, billINR: number): number {
  return Math.round(billINR * EXEMPT_COST_SHARE[procedure]);
}

/** Consumables estimate used when the simulator's "auto" toggle is on. */
export function estimateConsumables(rules: ExtractedPolicyRules, billINR: number): number {
  const pct = rules.nonMedicalConsumablesCovered.estimatedDeductionPercentIfExcluded || 0.08;
  return Math.round(billINR * pct);
}
