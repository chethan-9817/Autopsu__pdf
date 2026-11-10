/**
 * Gemini `responseSchema` mirroring src/types/policy.ts (ExtractedPolicyRules).
 * Gemini's OpenAPI subset has no tuples, so box2d is an INTEGER array pinned to 4 items.
 */
import { Type, type Schema } from "@google/genai";

const citation: Schema = {
  type: Type.OBJECT,
  description: "Visual citation for the clause this rule was read from.",
  properties: {
    pageNumber: { type: Type.INTEGER, description: "1-indexed physical page of the PDF file (not the printed page label)." },
    clauseId: { type: Type.STRING, description: 'Section number and short title, e.g. "Section 3.1(b) - Room Rent Limit".' },
    verbatimQuote: {
      type: Type.STRING,
      description: "Exact, contiguous text copied character-for-character from that page (max ~350 characters). No paraphrasing, no ellipses.",
    },
    box2d: {
      type: Type.ARRAY,
      description: "[ymin, xmin, ymax, xmax] of the quoted clause or table row on that page, integers normalized 0-1000.",
      items: { type: Type.INTEGER },
      minItems: "4",
      maxItems: "4",
    },
  },
  required: ["pageNumber", "clauseId", "verbatimQuote", "box2d"],
  propertyOrdering: ["pageNumber", "clauseId", "verbatimQuote", "box2d"],
};

export const policyResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    policyName: { type: Type.STRING },
    insurerName: { type: Type.STRING },
    baseSumInsured: { type: Type.NUMBER, description: "Sum insured in INR, e.g. 500000." },
    roomRentRule: {
      type: Type.OBJECT,
      properties: {
        limitType: { type: Type.STRING, enum: ["PERCENT_OF_SI", "FLAT_CAP", "SINGLE_PRIVATE_AC", "NO_CAP"] },
        limitValue: { type: Type.NUMBER, description: "Fraction for PERCENT_OF_SI (0.01 = 1%), INR/day for FLAT_CAP, 0 otherwise." },
        MaxDailyRoomRentINR: { type: Type.NUMBER, description: "Daily room cap in INR. 0 if there is no numeric cap." },
        icuLimitType: { type: Type.STRING, enum: ["PERCENT_OF_SI", "FLAT_CAP", "NO_CAP"] },
        icuLimitValue: { type: Type.NUMBER, description: "Fraction for PERCENT_OF_SI (0.02 = 2%), INR/day for FLAT_CAP, 0 for NO_CAP." },
        proportionateDeductionApplies: {
          type: Type.BOOLEAN,
          description: "True if associated medical expenses are reduced in proportion when a costlier room is chosen.",
        },
        citation,
      },
      required: ["limitType", "limitValue", "MaxDailyRoomRentINR", "icuLimitType", "icuLimitValue", "proportionateDeductionApplies", "citation"],
      propertyOrdering: ["limitType", "limitValue", "MaxDailyRoomRentINR", "icuLimitType", "icuLimitValue", "proportionateDeductionApplies", "citation"],
    },
    coPayRule: {
      type: Type.OBJECT,
      properties: {
        mandatoryCoPayPercent: { type: Type.NUMBER, description: "Fraction, e.g. 0.2 for 20%. 0 if none." },
        zonalCoPayPercent: { type: Type.NUMBER, description: "Extra fraction charged when treated in a costlier zone than the premium zone. 0 if none." },
        ageTriggerYears: {
          type: Type.INTEGER,
          nullable: true,
          description: "Age from which the mandatory co-pay applies. null if it applies at every age.",
        },
        citation,
      },
      required: ["mandatoryCoPayPercent", "zonalCoPayPercent", "ageTriggerYears", "citation"],
      propertyOrdering: ["mandatoryCoPayPercent", "zonalCoPayPercent", "ageTriggerYears", "citation"],
    },
    waitingPeriods: {
      type: Type.OBJECT,
      properties: {
        initialWaitingDays: { type: Type.INTEGER },
        specificDiseasesMonths: { type: Type.INTEGER },
        specificDiseasesList: { type: Type.ARRAY, items: { type: Type.STRING } },
        preExistingDiseasesMonths: { type: Type.INTEGER },
        citation,
      },
      required: ["initialWaitingDays", "specificDiseasesMonths", "specificDiseasesList", "preExistingDiseasesMonths", "citation"],
      propertyOrdering: ["initialWaitingDays", "specificDiseasesMonths", "specificDiseasesList", "preExistingDiseasesMonths", "citation"],
    },
    subLimits: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          procedureName: { type: Type.STRING },
          maxCapINR: { type: Type.NUMBER, description: "Cap in INR. Convert %-of-SI caps to INR using baseSumInsured." },
          citation,
        },
        required: ["procedureName", "maxCapINR", "citation"],
        propertyOrdering: ["procedureName", "maxCapINR", "citation"],
      },
    },
    nonMedicalConsumablesCovered: {
      type: Type.OBJECT,
      properties: {
        isCovered: { type: Type.BOOLEAN },
        estimatedDeductionPercentIfExcluded: { type: Type.NUMBER, description: "Fraction of a bill typically lost to consumables; use 0.08 unless the policy says otherwise." },
        citation,
      },
      required: ["isCovered", "estimatedDeductionPercentIfExcluded", "citation"],
      propertyOrdering: ["isCovered", "estimatedDeductionPercentIfExcluded", "citation"],
    },
  },
  required: ["policyName", "insurerName", "baseSumInsured", "roomRentRule", "coPayRule", "waitingPeriods", "subLimits", "nonMedicalConsumablesCovered"],
  propertyOrdering: ["policyName", "insurerName", "baseSumInsured", "roomRentRule", "coPayRule", "waitingPeriods", "subLimits", "nonMedicalConsumablesCovered"],
};

export const EXTRACTION_PROMPT = `You are an IRDAI health-insurance wording analyst. Read the attached Indian health insurance policy (wording, schedule, prospectus or brochure) and extract the claim-settlement rules into the JSON schema.

Read multi-column "Schedule of Benefits" / "Table of Benefits" tables visually, row by row. Do not mix up columns or plan variants.

Rules:
- Percentages are FRACTIONS: 1% -> 0.01, 20% -> 0.2.
- baseSumInsured: the sum insured on the policy schedule. If only options are listed, use the most common retail option shown (prefer 500000 if offered).
- roomRentRule: "1% of SI per day" -> PERCENT_OF_SI, limitValue 0.01, MaxDailyRoomRentINR = baseSumInsured * 0.01. "Rs 5,000 per day" -> FLAT_CAP, limitValue 5000, MaxDailyRoomRentINR 5000. "Single private AC room" -> SINGLE_PRIVATE_AC, MaxDailyRoomRentINR 0. "No capping / any room" -> NO_CAP, MaxDailyRoomRentINR 0.
- proportionateDeductionApplies: true only if the wording says associated/other expenses are paid in proportion when a higher room category is chosen.
- coPayRule: mandatoryCoPayPercent is the general co-pay. If it applies only above an age, put that age in ageTriggerYears, else null. zonalCoPayPercent is the extra co-pay for treatment in a higher zone (0 if not mentioned).
- waitingPeriods: initial waiting days (usually 30), specific/named disease waiting months (usually 24) with every listed condition, and pre-existing disease months (usually 36 or 48). If a waiting-period reduction option is shown as opted, use the reduced figure.
- subLimits: every disease- or procedure-wise cap (cataract, knee/joint replacement, cardiac, modern treatments, robotic surgery, etc.). Convert %-of-SI caps to INR. Empty array if none.
- nonMedicalConsumablesCovered.isCovered: true only if consumables / non-payable items are explicitly covered (built-in or opted).
- If a rule is genuinely absent, use the neutral value (0, NO_CAP, false, empty list) and cite the closest relevant clause (e.g. the schedule of benefits).

Citations (critical):
- pageNumber is the 1-indexed physical page of this PDF file.
- verbatimQuote is copied EXACTLY from that page: same words, same order, one contiguous passage, at most ~350 characters. Never paraphrase or join passages.
- box2d is [ymin, xmin, ymax, xmax] around that quoted clause or table row on that page, normalized to 0-1000 (0,0 = top-left).`;
