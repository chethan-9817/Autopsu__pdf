/**
 * Sample 1: a trap-heavy "classic" plan in the style of budget Indian retail
 * policies: 1% room cap with proportionate deduction, 20% co-pay on every claim,
 * zonal co-pay, disease sub-limits and no consumables cover.
 * The insurer and product are FICTIONAL.
 */
import type { SampleDefinition } from "./types";
import { rowQuote } from "./types";

const ROWS = {
  inpatient: ["1", "In-patient hospitalisation (min. 24 hours)", "Up to Sum Insured"],
  room: ["2", "Room rent, boarding and nursing", "Up to 1% of Sum Insured per day (Rs. 5,000 per day)"],
  icu: ["3", "ICU / ICCU charges", "Up to 2% of Sum Insured per day (Rs. 10,000 per day)"],
  cataract: ["4", "Cataract surgery", "Up to Rs. 40,000 per eye"],
  knee: ["5", "Total Knee Replacement (joint replacement surgery)", "Up to Rs. 1,50,000 per knee"],
  cardiac: ["6", "Cardiac procedures (Angioplasty / CABG)", "Up to Rs. 2,00,000 per policy year"],
  robotic: ["7", "Modern Treatments incl. Robotic Surgery", "Up to 25% of Sum Insured (Rs. 1,25,000)"],
  pre: ["8", "Pre-hospitalisation medical expenses", "30 days prior to admission"],
  post: ["9", "Post-hospitalisation medical expenses", "60 days after discharge"],
  ambulance: ["10", "Road ambulance", "Up to Rs. 2,000 per hospitalisation"],
  consumables: ["11", "Non-medical items / consumables", "Not covered (refer Annexure I)"],
  copay: ["12", "Co-payment", "20% of every admissible claim"],
};

const clauses = {
  roomRent: {
    clauseId: "Section 3.1(b) - Room Rent Limit & Proportionate Deduction",
    quote:
      "If the Insured Person is admitted in a room where the room rent exceeds 1% of the Sum Insured per day (Rs. 5,000 per day) or the ICU charges exceed 2% of the Sum Insured per day, the difference shall be borne by the Insured Person and all Associated Medical Expenses shall be payable in the same proportion as the eligible room rent bears to the actual room rent incurred.",
  },
  copay: {
    clauseId: "Section 5 - Co-payment (Mandatory & Zonal)",
    quote:
      "A co-payment of 20% shall apply on each and every admissible claim, irrespective of the age of the Insured Person.",
  },
  waiting: {
    clauseId: "Section 4.2 - Specific Disease Waiting Period",
    quote:
      "Expenses related to the treatment of the following listed conditions, surgeries or treatments shall be excluded until the expiry of 24 months of continuous coverage after the date of inception of the first policy with us.",
  },
  consumables: {
    clauseId: "Annexure I - List of Non-Payable Items (Consumables)",
    quote:
      "The following items of non-medical expenses are not payable under this Policy, unless specifically stated otherwise in the Policy Schedule.",
  },
  subCataract: { clauseId: "Schedule of Benefits, Row 4 - Cataract Sub-limit", quote: rowQuote(ROWS.cataract) },
  subKnee: { clauseId: "Schedule of Benefits, Row 5 - Knee Replacement Sub-limit", quote: rowQuote(ROWS.knee) },
  subCardiac: { clauseId: "Schedule of Benefits, Row 6 - Cardiac Sub-limit", quote: rowQuote(ROWS.cardiac) },
  subRobotic: { clauseId: "Schedule of Benefits, Row 7 - Modern Treatments Sub-limit", quote: rowQuote(ROWS.robotic) },
};

export const classicPlan: SampleDefinition = {
  id: "sample-classic",
  label: "Navakshitij Suraksha Classic",
  tagline: "1% room cap · 20% co-pay · sub-limits",
  fileName: "Navakshitij-Suraksha-Classic-Policy-Wording.pdf",
  clauses,
  document: {
    insurer: "Navakshitij Health Insurance Ltd.",
    product: "Suraksha Classic",
    uin: "NAVHLIP26001V012526",
    blocks: [
      {
        kind: "title",
        text: "Suraksha Classic Health Insurance Policy",
        sub: "Policy Wording and Schedule. Individual / Family Floater. Read the waiting periods, sub-limits and co-payment sections carefully before purchase.",
      },
      { kind: "heading", text: "Policy Schedule" },
      {
        kind: "kv",
        rows: [
          { label: "Policy Number:", value: "NHI/SC/2026/0048213" },
          { label: "Product Name:", value: "Suraksha Classic Health Insurance Policy" },
          { label: "Insured Person:", value: "Primary Insured, Age 34 (Sample)" },
          { label: "Sum Insured:", value: "Rs. 5,00,000", cite: "si" },
          { label: "Premium Zone:", value: "Zone B (Tier-2 and Tier-3 cities)" },
          { label: "Policy Period:", value: "01/04/2026 to 31/03/2027" },
          { label: "Optional Covers:", value: "None opted" },
        ],
      },
      { kind: "heading", text: "Section 1 - Definitions" },
      {
        kind: "para",
        label: "1.1",
        text: "Associated Medical Expenses means Hospital charges that vary with the room category, such as surgeon fees, anaesthetist fees, operation theatre charges, doctor and specialist consultation fees and nursing charges. They do not include the cost of pharmacy and consumables, implants and medical devices, diagnostics, or ICU charges.",
      },
      {
        kind: "para",
        label: "1.2",
        text: "Hospitalisation means admission in a Hospital for a minimum period of 24 consecutive in-patient care hours, except for specified day care procedures.",
      },
      {
        kind: "para",
        label: "1.3",
        text: "Pre-Existing Disease means any condition, ailment, injury or disease that is diagnosed by a physician, or for which medical advice or treatment was recommended or received, within 36 months prior to the effective date of the policy.",
      },
      {
        kind: "para",
        label: "1.4",
        text: "Zone A cities are Delhi / NCR, Mumbai including Navi Mumbai and Thane, Kolkata, Chennai, Bengaluru, Hyderabad, Ahmedabad, Pune and Surat. All other locations are Zone B.",
      },
      { kind: "pageBreak" },
      { kind: "heading", text: "Section 2 - Schedule of Benefits" },
      {
        kind: "para",
        text: "All limits below apply per Insured Person per policy year and are subject to the terms, conditions, waiting periods and exclusions of this Policy.",
      },
      {
        kind: "table",
        columns: ["S.No", "Benefit", "Limit / Sub-limit"],
        widths: [8, 50, 42],
        rows: [
          { cells: ROWS.inpatient },
          { cells: ROWS.room, highlight: true },
          { cells: ROWS.icu, highlight: true },
          { cells: ROWS.cataract, cite: "subCataract" },
          { cells: ROWS.knee, cite: "subKnee" },
          { cells: ROWS.cardiac, cite: "subCardiac" },
          { cells: ROWS.robotic, cite: "subRobotic" },
          { cells: ROWS.pre },
          { cells: ROWS.post },
          { cells: ROWS.ambulance },
          { cells: ROWS.consumables },
          { cells: ROWS.copay },
        ],
      },
      { kind: "heading", text: "Section 3 - Basis of Claim Settlement" },
      {
        kind: "para",
        label: "3.1(a)",
        text: "Room rent, boarding and nursing expenses as provided by the Hospital shall be payable up to the limits specified in the Schedule of Benefits.",
      },
      { kind: "para", label: "3.1(b)", text: clauses.roomRent.quote, cite: "roomRent" },
      {
        kind: "para",
        label: "3.1(c)",
        text: "Where a sub-limit is specified for a procedure in the Schedule of Benefits, the maximum liability of the Company for that procedure, including pre- and post-hospitalisation expenses, shall not exceed the sub-limit.",
      },
      { kind: "pageBreak" },
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
          "Hydrocele",
          "Joint replacement surgery including Knee Replacement",
          "Kidney and gall bladder stones",
          "Benign prostatic hypertrophy",
          "Sinusitis and related disorders",
          "Piles, fissure and fistula",
          "Varicose veins",
          "Hysterectomy for benign conditions",
        ],
      },
      {
        kind: "para",
        label: "4.3",
        text: "Pre-existing diseases: Expenses related to the treatment of a Pre-Existing Disease and its direct complications shall be excluded until the expiry of 36 months of continuous coverage after the date of inception of the first policy with us.",
      },
      { kind: "heading", text: "Section 5 - Co-payment" },
      { kind: "para", label: "5.1", text: clauses.copay.quote, cite: "copay" },
      {
        kind: "para",
        label: "5.2",
        cite: "copay",
        text: "Zone-based co-payment: The premium for this Policy has been charged for Zone B. If the Insured Person takes treatment in a Zone A city, an additional co-payment of 15% shall apply on the admissible claim amount.",
      },
      {
        kind: "para",
        label: "5.3",
        text: "Co-payment shall be applied on the admissible claim amount after applying all deductions, sub-limits and proportionate deductions under this Policy.",
      },
      { kind: "heading", text: "Section 6 - Claim Procedure" },
      {
        kind: "para",
        label: "6.1",
        text: "Cashless facility is available only at network hospitals and is subject to pre-authorisation by the TPA. Intimation of planned hospitalisation must be given at least 72 hours before admission and of emergency hospitalisation within 24 hours of admission.",
      },
      { kind: "pageBreak" },
      { kind: "heading", text: "Annexure I - List of Non-Payable Items" },
      { kind: "para", text: clauses.consumables.quote, cite: "consumables", strong: true },
      {
        kind: "bullets",
        columns: 2,
        cite: "consumables",
        items: [
          "Gloves, caps, masks and shoe covers",
          "PPE kits",
          "Syringes and needles (non-medicated)",
          "Nebuliser kit",
          "Thermometer, BP cuffs",
          "Cotton, gauze and crepe bandages",
          "Admission kit and toiletries",
          "Urine bags and bed pans",
          "Disposable razors",
          "Documentation and registration charges",
          "Attendant and food charges",
          "Sterilisation and ECG electrode charges",
        ],
      },
      {
        kind: "para",
        text: "Note: Non-medical items and consumables typically amount to 8% to 10% of a hospital bill. These are payable only if the optional Consumables Cover is opted and shown in the Policy Schedule.",
      },
    ],
  },
  buildRules: (cite) => ({
    policyName: "Suraksha Classic Health Insurance Policy",
    insurerName: "Navakshitij Health Insurance Ltd.",
    baseSumInsured: 500000,
    roomRentRule: {
      limitType: "PERCENT_OF_SI",
      limitValue: 0.01,
      MaxDailyRoomRentINR: 5000,
      icuLimitType: "PERCENT_OF_SI",
      icuLimitValue: 0.02,
      proportionateDeductionApplies: true,
      citation: cite("roomRent"),
    },
    coPayRule: {
      mandatoryCoPayPercent: 0.2,
      zonalCoPayPercent: 0.15,
      ageTriggerYears: null,
      citation: cite("copay"),
    },
    waitingPeriods: {
      initialWaitingDays: 30,
      specificDiseasesMonths: 24,
      specificDiseasesList: [
        "Cataract",
        "Hernia of all types",
        "Hydrocele",
        "Joint replacement surgery including Knee Replacement",
        "Kidney and gall bladder stones",
        "Benign prostatic hypertrophy",
        "Sinusitis and related disorders",
        "Piles, fissure and fistula",
        "Varicose veins",
        "Hysterectomy for benign conditions",
      ],
      preExistingDiseasesMonths: 36,
      citation: cite("waiting"),
    },
    subLimits: [
      { procedureName: "Cataract", maxCapINR: 40000, citation: cite("subCataract") },
      { procedureName: "Total Knee Replacement", maxCapINR: 150000, citation: cite("subKnee") },
      { procedureName: "Cardiac procedures (Angioplasty / CABG)", maxCapINR: 200000, citation: cite("subCardiac") },
      { procedureName: "Modern Treatments / Robotic Surgery", maxCapINR: 125000, citation: cite("subRobotic") },
    ],
    nonMedicalConsumablesCovered: {
      isCovered: false,
      estimatedDeductionPercentIfExcluded: 0.08,
      citation: cite("consumables"),
    },
  }),
};
