/**
 * Sample 2: a premium "no-cap" comprehensive plan: any room, no proportionate
 * deduction, consumables covered, no sub-limits, reduced waiting periods,
 * and only a senior-citizen co-pay. Used as the clean contrast in the demo.
 * The insurer and product are FICTIONAL.
 */
import type { SampleDefinition } from "./types";

const clauses = {
  roomRent: {
    clauseId: "Section 3.1 - Room Rent (No Capping)",
    quote:
      "Room rent, boarding and nursing expenses are payable up to the Sum Insured for any room category, except a suite or above. No room rent capping and no proportionate deduction shall apply to any claim under this Policy.",
  },
  copay: {
    clauseId: "Section 5 - Co-payment (Senior Citizens)",
    quote:
      "A co-payment of 10% shall apply on each admissible claim only where the Insured Person is aged 61 years or above at the time of hospitalisation. No zone-based co-payment applies; the premium is charged on a pan-India basis.",
  },
  waiting: {
    clauseId: "Section 4.2 - Specific Disease Waiting Period (Reduced)",
    quote:
      "Under the opted Waiting Period Reduction benefit, the listed conditions, surgeries and treatments shall be excluded until the expiry of 12 months of continuous coverage.",
  },
  consumables: {
    clauseId: "Section 2.9 - Consumables Cover (Built-in)",
    quote:
      "The items listed as non-payable in Annexure I (gloves, PPE kits, syringes, nebuliser kits and similar consumables) are payable up to the Sum Insured under the built-in Consumables Cover.",
  },
};

export const comprehensivePlan: SampleDefinition = {
  id: "sample-comprehensive",
  label: "Tarangini Sampoorna Care",
  tagline: "No room cap · consumables covered",
  fileName: "Tarangini-Sampoorna-Care-Policy-Wording.pdf",
  clauses,
  document: {
    insurer: "Tarangini General Insurance Ltd.",
    product: "Sampoorna Care",
    uin: "TARHLIP26014V022526",
    blocks: [
      {
        kind: "title",
        text: "Sampoorna Care Comprehensive Health Policy",
        sub: "Policy Wording and Schedule. Individual / Family Floater. Comprehensive cover with no room rent capping.",
      },
      { kind: "heading", text: "Policy Schedule" },
      {
        kind: "kv",
        rows: [
          { label: "Policy Number:", value: "TGI/SPC/2026/1190774" },
          { label: "Product Name:", value: "Sampoorna Care Comprehensive Health Policy" },
          { label: "Insured Person:", value: "Primary Insured, Age 34 (Sample)" },
          { label: "Sum Insured:", value: "Rs. 10,00,000", cite: "si" },
          { label: "Premium Zone:", value: "Pan-India (single zone)" },
          { label: "Policy Period:", value: "01/04/2026 to 31/03/2027" },
          { label: "Optional Covers:", value: "Waiting Period Reduction; Consumables Cover (built-in)" },
        ],
      },
      { kind: "heading", text: "Section 1 - Definitions" },
      {
        kind: "para",
        label: "1.1",
        text: "Hospitalisation means admission in a Hospital for a minimum period of 24 consecutive in-patient care hours, except for specified day care procedures.",
      },
      {
        kind: "para",
        label: "1.2",
        text: "Pre-Existing Disease means any condition, ailment, injury or disease that is diagnosed by a physician, or for which medical advice or treatment was recommended or received, within 36 months prior to the effective date of the policy.",
      },
      { kind: "heading", text: "Section 2 - Schedule of Benefits" },
      {
        kind: "table",
        columns: ["S.No", "Benefit", "Limit"],
        widths: [8, 50, 42],
        rows: [
          { cells: ["1", "In-patient hospitalisation (min. 24 hours)", "Up to Sum Insured"] },
          { cells: ["2", "Room rent, boarding and nursing", "Any room except suite (no capping)"], highlight: true },
          { cells: ["3", "ICU / ICCU charges", "Up to Sum Insured"] },
          { cells: ["4", "Modern Treatments incl. Robotic Surgery", "Up to Sum Insured"] },
          { cells: ["5", "Pre-hospitalisation medical expenses", "60 days prior to admission"] },
          { cells: ["6", "Post-hospitalisation medical expenses", "180 days after discharge"] },
          { cells: ["7", "Road ambulance", "Up to Rs. 5,000 per hospitalisation"] },
          { cells: ["8", "Consumables Cover", "Up to Sum Insured (built-in)"], highlight: true },
          { cells: ["9", "Co-payment", "Nil (10% only for age 61 and above)"] },
        ],
      },
      { kind: "para", label: "2.9", text: clauses.consumables.quote, cite: "consumables" },
      { kind: "pageBreak" },
      { kind: "heading", text: "Section 3 - Basis of Claim Settlement" },
      { kind: "para", label: "3.1", text: clauses.roomRent.quote, cite: "roomRent" },
      {
        kind: "para",
        label: "3.2",
        text: "No disease-wise or procedure-wise sub-limits apply under this Policy. All admissible expenses are payable up to the Sum Insured.",
      },
      { kind: "heading", text: "Section 4 - Waiting Periods" },
      {
        kind: "para",
        label: "4.1",
        text: "Initial waiting period: Expenses related to the treatment of any illness within 30 days from the first policy commencement date shall be excluded, except claims arising due to an accident.",
      },
      { kind: "para", label: "4.2", text: clauses.waiting.quote, cite: "waiting" },
      {
        kind: "bullets",
        columns: 2,
        cite: "waiting",
        items: [
          "Cataract",
          "Hernia of all types",
          "Joint replacement surgery including Knee Replacement",
          "Kidney and gall bladder stones",
          "Benign prostatic hypertrophy",
          "Piles, fissure and fistula",
        ],
      },
      {
        kind: "para",
        label: "4.3",
        text: "Pre-existing diseases: Under the opted Waiting Period Reduction benefit, expenses related to a Pre-Existing Disease shall be excluded until the expiry of 24 months of continuous coverage.",
      },
      { kind: "heading", text: "Section 5 - Co-payment" },
      { kind: "para", label: "5.1", text: clauses.copay.quote, cite: "copay" },
      { kind: "heading", text: "Section 6 - Claim Procedure" },
      {
        kind: "para",
        label: "6.1",
        text: "Cashless facility is available at network hospitals subject to pre-authorisation. Intimation of planned hospitalisation must be given at least 48 hours before admission and of emergency hospitalisation within 24 hours of admission.",
      },
    ],
  },
  buildRules: (cite) => ({
    policyName: "Sampoorna Care Comprehensive Health Policy",
    insurerName: "Tarangini General Insurance Ltd.",
    baseSumInsured: 1000000,
    roomRentRule: {
      limitType: "NO_CAP",
      limitValue: 0,
      MaxDailyRoomRentINR: 0,
      icuLimitType: "NO_CAP",
      icuLimitValue: 0,
      proportionateDeductionApplies: false,
      citation: cite("roomRent"),
    },
    coPayRule: {
      mandatoryCoPayPercent: 0.1,
      zonalCoPayPercent: 0,
      ageTriggerYears: 61,
      citation: cite("copay"),
    },
    waitingPeriods: {
      initialWaitingDays: 30,
      specificDiseasesMonths: 12,
      specificDiseasesList: [
        "Cataract",
        "Hernia of all types",
        "Joint replacement surgery including Knee Replacement",
        "Kidney and gall bladder stones",
        "Benign prostatic hypertrophy",
        "Piles, fissure and fistula",
      ],
      preExistingDiseasesMonths: 24,
      citation: cite("waiting"),
    },
    subLimits: [],
    nonMedicalConsumablesCovered: {
      isCovered: true,
      estimatedDeductionPercentIfExcluded: 0.08,
      citation: cite("consumables"),
    },
  }),
};
