import { beforeAll, describe, expect, it } from "vitest";
import type { ExtractedPolicyRules } from "../types/policy";
import type { ClaimScenario } from "../types/simulation";
import { PROCEDURE_TYPES } from "../types/simulation";
import { buildSampleProfile } from "../samples";
import { classicPlan } from "../samples/classicPlan";
import { comprehensivePlan } from "../samples/comprehensivePlan";
import { simulateHospitalClaim } from "./claimSimulator";
import { runAdversarialTraps } from "./adversarialTraps";
import { parseScenario, parseINRAmount } from "./scenarioParser";
import { normalizeRules } from "../extraction/normalizeRules";

let classic: ExtractedPolicyRules;
let comprehensive: ExtractedPolicyRules;

beforeAll(async () => {
  classic = (await buildSampleProfile(classicPlan)).rules;
  comprehensive = (await buildSampleProfile(comprehensivePlan)).rules;
});

const base: ClaimScenario = {
  procedureType: "General Hospitalization",
  isPreExisting: false,
  policyAgeMonths: 36,
  daysInRoom: 4,
  actualDailyRoomRentINR: 9000,
  totalHospitalBillINR: 350000,
  consumablesBillINR: 40000,
  exemptMedicalCostsINR: 0,
  patientAgeYears: 35,
  treatedInHigherZone: false,
};

describe("simulateHospitalClaim — classic 1% room cap plan", () => {
  it("reproduces the spec's proportionate-deduction example to the rupee (no exempt costs)", () => {
    const r = simulateHospitalClaim(classic, base);
    const steps = r.lines.map((l) => [l.step, l.amountDeductedINR]);
    expect(steps).toEqual([
      ["CONSUMABLES", 40000],
      ["ROOM_RENT_EXCESS", 16000], // (9000 - 5000) × 4
      ["PROPORTIONATE_DEDUCTION", 121778], // 274000 × (1 - 5000/9000)
      ["CO_PAY", 34444], // 20% of 172222
    ]);
    const prop = r.lines.find((l) => l.step === "PROPORTIONATE_DEDUCTION")!;
    expect(prop.formulaUsed).toBe("₹2,74,000 × (1 − 5,000/9,000) = −₹1,21,778");
    expect(r.insurerPaysINR).toBe(137778);
    expect(r.outOfPocketINR).toBe(212222);
    expect(r.rejected).toBe(false);
  });

  it("keeps medicines, implants and tests out of the proportionate cut (IRDAI 2020)", () => {
    const r = simulateHospitalClaim(classic, { ...base, exemptMedicalCostsINR: 90000 });
    const steps = r.lines.map((l) => [l.step, l.amountDeductedINR]);
    expect(steps).toEqual([
      ["CONSUMABLES", 40000],
      ["ROOM_RENT_EXCESS", 16000],
      ["PROPORTIONATE_DEDUCTION", 81778], // (274000 - 90000) × (1 - 5000/9000)
      ["CO_PAY", 42444], // 20% of 212222
    ]);
    expect(r.lines[2].formulaUsed).toBe("₹1,84,000 × (1 − 5,000/9,000) = −₹81,778");
    expect(r.insurerPaysINR).toBe(169778);
  });

  it("caps exempt costs at the bill minus consumables", () => {
    const r = simulateHospitalClaim(classic, { ...base, exemptMedicalCostsINR: 9_999_999 });
    expect(r.lines.some((l) => l.step === "PROPORTIONATE_DEDUCTION")).toBe(false);
    expect(r.notes.some((n) => n.includes("capped"))).toBe(true);
  });

  it("adds zonal co-pay only when treated in a higher zone", () => {
    const r = simulateHospitalClaim(classic, { ...base, treatedInHigherZone: true });
    const copay = r.lines.find((l) => l.step === "CO_PAY")!;
    expect(copay.amountDeductedINR).toBe(Math.round(172222 * 0.35));
    expect(copay.formulaUsed).toContain("20% mandatory + 15% zonal");
  });

  it("rejects a knee replacement at month 18 (24-month specific-disease list)", () => {
    const r = simulateHospitalClaim(classic, { ...base, procedureType: "Knee Replacement", policyAgeMonths: 18 });
    expect(r.rejected).toBe(true);
    expect(r.insurerPaysINR).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].step).toBe("WAITING_PERIOD");
    expect(r.lines[0].citation.clauseId).toContain("4.2");
  });

  it("applies the knee sub-limit once the waiting period is over", () => {
    const r = simulateHospitalClaim(classic, {
      ...base,
      procedureType: "Knee Replacement",
      policyAgeMonths: 25,
      actualDailyRoomRentINR: 4000,
      totalHospitalBillINR: 300000,
      consumablesBillINR: 24000,
    });
    const sub = r.lines.find((l) => l.step === "SUB_LIMIT")!;
    expect(sub.amountDeductedINR).toBe(276000 - 150000);
    expect(r.insurerPaysINR).toBe(120000); // 150000 less 20% co-pay
  });

  it("rejects a pre-existing condition inside the PED waiting period", () => {
    const r = simulateHospitalClaim(classic, { ...base, isPreExisting: true, policyAgeMonths: 20 });
    expect(r.rejected).toBe(true);
    expect(r.lines[0].formulaUsed).toContain("PED waiting 36 mo");
  });

  it("rejects illness in the initial 30-day waiting period", () => {
    const r = simulateHospitalClaim(classic, { ...base, policyAgeMonths: 0 });
    expect(r.rejected).toBe(true);
  });

  it("uses the ICU cap (2% of SI) for Cardiac / ICU", () => {
    const r = simulateHospitalClaim(classic, { ...base, procedureType: "Cardiac / ICU", actualDailyRoomRentINR: 12000 });
    const excess = r.lines.find((l) => l.step === "ROOM_RENT_EXCESS")!;
    expect(excess.amountDeductedINR).toBe((12000 - 10000) * 4);
  });

  it("never applies proportionate deduction to ICU charges (IRDAI 2020)", () => {
    const r = simulateHospitalClaim(classic, { ...base, procedureType: "Cardiac / ICU", actualDailyRoomRentINR: 12000 });
    expect(r.lines.some((l) => l.step === "PROPORTIONATE_DEDUCTION")).toBe(false);
    expect(r.notes.some((n) => n.includes("ICU"))).toBe(true);
  });
});

describe("simulateHospitalClaim — comprehensive no-cap plan", () => {
  it("pays a general claim in full for a 35-year-old", () => {
    const r = simulateHospitalClaim(comprehensive, base);
    expect(r.lines).toHaveLength(0);
    expect(r.insurerPaysINR).toBe(350000);
  });

  it("applies the senior co-pay only from age 61", () => {
    expect(simulateHospitalClaim(comprehensive, { ...base, patientAgeYears: 60 }).lines).toHaveLength(0);
    const r = simulateHospitalClaim(comprehensive, { ...base, patientAgeYears: 61 });
    expect(r.lines.map((l) => l.step)).toEqual(["CO_PAY"]);
    expect(r.insurerPaysINR).toBe(315000);
  });

  it("caps the payout at the sum insured", () => {
    const r = simulateHospitalClaim(comprehensive, { ...base, totalHospitalBillINR: 1500000 });
    const cap = r.lines.find((l) => l.step === "SUM_INSURED_CAP")!;
    expect(cap.amountDeductedINR).toBe(500000);
    expect(r.insurerPaysINR).toBe(1000000);
  });
});

describe("receipt integrity", () => {
  it("insurer payout + every deduction always equals the bill, never negative", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const bill = Math.round(50000 + rand() * 1450000);
      const scenario: ClaimScenario = {
        procedureType: PROCEDURE_TYPES[Math.floor(rand() * PROCEDURE_TYPES.length)],
        isPreExisting: rand() < 0.3,
        policyAgeMonths: Math.floor(1 + rand() * 60),
        daysInRoom: Math.floor(rand() * 15),
        actualDailyRoomRentINR: Math.round(3000 + rand() * 12000),
        totalHospitalBillINR: bill,
        consumablesBillINR: Math.round(bill * rand() * 0.15),
        exemptMedicalCostsINR: Math.round(bill * rand() * 0.6),
        patientAgeYears: Math.floor(20 + rand() * 60),
        treatedInHigherZone: rand() < 0.5,
      };
      for (const rules of [classic, comprehensive]) {
        const r = simulateHospitalClaim(rules, scenario);
        const deducted = r.lines.reduce((s, l) => s + l.amountDeductedINR, 0);
        expect(r.insurerPaysINR + deducted).toBe(r.totalBillINR);
        expect(r.insurerPaysINR).toBeGreaterThanOrEqual(0);
        expect(r.insurerPaysINR).toBeLessThanOrEqual(rules.baseSumInsured);
        r.lines.forEach((l) => expect(l.amountDeductedINR).toBeGreaterThan(0));
      }
    }
  });
});

describe("adversarial traps", () => {
  it("flags all three traps as critical on the classic plan", () => {
    const traps = runAdversarialTraps(classic);
    expect(traps.map((t) => t.severity)).toEqual(["critical", "critical", "critical"]);
    const [room, year2, whammy] = traps;
    // 14,000 excess + (3,50,000 − 34,000 rent − 28,000 consumables − 1,05,000 medicines/implants/tests) × (3,500/8,500)
    expect(room.headlineINR).toBe(14000 + Math.round(183000 * (3500 / 8500)));
    expect(year2.breakdown.rejected).toBe(true);
    expect(year2.scenario.procedureType).toBe("Knee Replacement");
    expect(whammy.breakdown.lines.some((l) => l.step === "ROOM_RENT_EXCESS")).toBe(false);
  });

  it("shows the comprehensive plan mostly clear", () => {
    const traps = runAdversarialTraps(comprehensive);
    expect(traps[0].severity).toBe("clear");
    expect(traps[1].severity).toBe("clear");
    expect(traps[2].headlineINR).toBe(50000); // 10% senior co-pay only
  });
});

describe("scenario parser", () => {
  it("parses the demo sentence", () => {
    const { patch } = parseScenario("Knee surgery in month 18, 4 days in a ₹9,000 room, total bill ₹3.5L");
    expect(patch).toMatchObject({
      procedureType: "Knee Replacement",
      policyAgeMonths: 18,
      daysInRoom: 4,
      actualDailyRoomRentINR: 9000,
      totalHospitalBillINR: 350000,
    });
  });

  it("handles other phrasings", () => {
    expect(parseScenario("ICU for 5 days at 12k per day, bill of 5 lakh, my 65 year old father, Mumbai").patch).toMatchObject({
      procedureType: "Cardiac / ICU",
      daysInRoom: 5,
      actualDailyRoomRentINR: 12000,
      totalHospitalBillINR: 500000,
      patientAgeYears: 65,
      treatedInHigherZone: true,
    });
    expect(parseScenario("cataract 2 years into the policy, diabetic, cost Rs 65,000").patch).toMatchObject({
      procedureType: "Cataract",
      policyAgeMonths: 24,
      isPreExisting: true,
      totalHospitalBillINR: 65000,
    });
  });

  it("parses Indian money shorthand", () => {
    expect(parseINRAmount("3.5", "L")).toBe(350000);
    expect(parseINRAmount("3,50,000")).toBe(350000);
    expect(parseINRAmount("9", "k")).toBe(9000);
    expect(parseINRAmount("1.2", "cr")).toBe(12000000);
  });
});

describe("normalizeRules", () => {
  it("repairs percentages and recomputes the room cap", () => {
    const { rules, warnings } = normalizeRules({
      baseSumInsured: 300000,
      roomRentRule: { limitType: "PERCENT_OF_SI", limitValue: 1, MaxDailyRoomRentINR: 5000, icuLimitType: "PERCENT_OF_SI", icuLimitValue: 2, proportionateDeductionApplies: true, citation: { pageNumber: 2, clauseId: "3.1", verbatimQuote: "x", box2d: [500, 100, 400, 900] } },
      coPayRule: { mandatoryCoPayPercent: 20, zonalCoPayPercent: 0, ageTriggerYears: null },
      waitingPeriods: { initialWaitingDays: 30, specificDiseasesMonths: 24, specificDiseasesList: ["Cataract"], preExistingDiseasesMonths: 48 },
      subLimits: [{ procedureName: "Cataract", maxCapINR: 25000 }, { procedureName: "", maxCapINR: 0 }],
      nonMedicalConsumablesCovered: { isCovered: false, estimatedDeductionPercentIfExcluded: 0 },
    });
    expect(rules.roomRentRule.limitValue).toBe(0.01);
    expect(rules.roomRentRule.MaxDailyRoomRentINR).toBe(3000);
    expect(rules.roomRentRule.icuLimitValue).toBe(0.02);
    expect(rules.roomRentRule.citation.box2d).toEqual([400, 100, 500, 900]);
    expect(rules.coPayRule.mandatoryCoPayPercent).toBe(0.2);
    expect(rules.subLimits).toHaveLength(1);
    expect(rules.nonMedicalConsumablesCovered.estimatedDeductionPercentIfExcluded).toBe(0.08);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
