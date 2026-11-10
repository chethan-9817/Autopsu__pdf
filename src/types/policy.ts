/**
 * Strict extraction contract. Gemini is forced into this shape via
 * `responseSchema` (see src/extraction/schema.ts), and the pre-extracted
 * sample profiles use the same shape so the engine never knows the difference.
 */

/** Where a box2d came from. Shown in the evidence badge so judges know how much to trust it. */
export type BoxSource = "generator" | "text-layer" | "model";

export interface BoundingBoxCitation {
  pageNumber: number; // 1-indexed page number
  clauseId: string; // e.g., "Section 3.1(b) - Room Rent Limit"
  verbatimQuote: string; // Exact text from the PDF
  box2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  boxSource?: BoxSource;
}

export type RoomLimitType = "PERCENT_OF_SI" | "FLAT_CAP" | "SINGLE_PRIVATE_AC" | "NO_CAP";
export type IcuLimitType = "PERCENT_OF_SI" | "FLAT_CAP" | "NO_CAP";

export interface SubLimitRule {
  procedureName: string; // e.g., "Cataract", "Total Knee Replacement", "Modern Treatments / Robotic Surgery"
  maxCapINR: number; // e.g., 40000
  citation: BoundingBoxCitation;
}

export interface ExtractedPolicyRules {
  policyName: string;
  insurerName: string;
  baseSumInsured: number; // INR

  roomRentRule: {
    limitType: RoomLimitType;
    limitValue: number; // 0.01 for 1% of SI, or 5000 for Rs 5,000/day
    MaxDailyRoomRentINR: number; // Computed daily cap in INR (0 = no numeric cap)
    icuLimitType: IcuLimitType;
    icuLimitValue: number; // 0.02 for 2% of SI
    proportionateDeductionApplies: boolean;
    citation: BoundingBoxCitation;
  };

  coPayRule: {
    mandatoryCoPayPercent: number; // 0.10 / 0.20 (0 if none)
    zonalCoPayPercent: number; // 0.15 if treated in a higher zone than the premium zone
    ageTriggerYears: number | null; // mandatory co-pay applies only at/after this age; null = all ages
    citation: BoundingBoxCitation;
  };

  waitingPeriods: {
    initialWaitingDays: number;
    specificDiseasesMonths: number;
    specificDiseasesList: string[];
    preExistingDiseasesMonths: number;
    citation: BoundingBoxCitation;
  };

  subLimits: SubLimitRule[];

  nonMedicalConsumablesCovered: {
    isCovered: boolean;
    estimatedDeductionPercentIfExcluded: number; // default 0.08
    citation: BoundingBoxCitation;
  };
}

/** A policy the UI can show: rules + the PDF bytes they came from. */
export interface PolicyProfile {
  id: string;
  label: string;
  tagline: string;
  source: "sample" | "upload";
  rules: ExtractedPolicyRules;
  pdfBytes: Uint8Array;
  fileName: string;
}
