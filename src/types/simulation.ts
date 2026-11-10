import type { BoundingBoxCitation } from "./policy";

export const PROCEDURE_TYPES = [
  "General Hospitalization",
  "Knee Replacement",
  "Cataract",
  "Cardiac / ICU",
  "Robotic / Modern Treatment",
] as const;

export type ProcedureType = (typeof PROCEDURE_TYPES)[number];

export interface ClaimScenario {
  procedureType: ProcedureType;
  isPreExisting: boolean;
  policyAgeMonths: number;
  daysInRoom: number;
  actualDailyRoomRentINR: number; // ICU daily charge when procedureType is "Cardiac / ICU"
  totalHospitalBillINR: number;
  consumablesBillINR: number;
  /**
   * Medicines (pharmacy), implants / medical devices and diagnostics on the bill.
   * IRDAI (2020) bars proportionate deduction on these heads, so they are paid in full
   * even when the room is over the cap.
   */
  exemptMedicalCostsINR: number;
  /** Patient age, used for an age-triggered co-pay. Defaults to 35. */
  patientAgeYears?: number;
  /** Treated in a costlier zone (e.g. Zone A metro) than the zone the premium was priced for. */
  treatedInHigherZone?: boolean;
}

export type DeductionStep =
  | "WAITING_PERIOD"
  | "CONSUMABLES"
  | "ROOM_RENT_EXCESS"
  | "PROPORTIONATE_DEDUCTION"
  | "SUB_LIMIT"
  | "CO_PAY"
  | "SUM_INSURED_CAP";

export interface DeductionLine {
  id: string;
  step: DeductionStep;
  title: string;
  amountDeductedINR: number;
  formulaUsed: string;
  explanation: string;
  citation: BoundingBoxCitation;
  /** Eligible amount still payable after this line. */
  runningEligibleINR: number;
}

export interface SimulationBreakdown {
  scenario: ClaimScenario;
  totalBillINR: number;
  insurerPaysINR: number;
  outOfPocketINR: number;
  outOfPocketPercent: number; // 0-1
  rejected: boolean;
  lines: DeductionLine[];
  /** Plain-language notes about inputs that were adjusted or assumptions made. */
  notes: string[];
}
