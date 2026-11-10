/**
 * Deterministic guard between the LLM and the engine. Gemini's JSON is
 * schema-shaped but can still be semantically off (20 instead of 0.2, a cap that
 * disagrees with its own percentage, a swapped box). Everything is repaired
 * here and every repair is reported, so the engine only ever sees sane numbers.
 */
import type {
  BoundingBoxCitation,
  ExtractedPolicyRules,
  IcuLimitType,
  RoomLimitType,
  SubLimitRule,
} from "../types/policy";

export interface NormalizeResult {
  rules: ExtractedPolicyRules;
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number.parseFloat(v.replace(/[,₹\s]/g, "")) : typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeCitation(raw: unknown, fallbackClause: string): BoundingBoxCitation {
  const c = obj(raw);
  const citation: BoundingBoxCitation = {
    pageNumber: Math.max(1, Math.round(num(c.pageNumber, 1))),
    clauseId: typeof c.clauseId === "string" && c.clauseId.trim() ? c.clauseId.trim() : fallbackClause,
    verbatimQuote: typeof c.verbatimQuote === "string" ? c.verbatimQuote.trim() : "",
  };
  if (Array.isArray(c.box2d) && c.box2d.length === 4) {
    let [ymin, xmin, ymax, xmax] = c.box2d.map((v) => Math.max(0, Math.min(1000, Math.round(num(v, 0)))));
    if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
    if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
    if (ymax - ymin >= 4 && xmax - xmin >= 4) {
      citation.box2d = [ymin, xmin, ymax, xmax];
      citation.boxSource = "model";
    }
  }
  return citation;
}

export function normalizeRules(raw: unknown): NormalizeResult {
  const warnings: string[] = [];
  const r = obj(raw);

  const fraction = (v: unknown, label: string, fallback = 0): number => {
    let n = num(v, fallback);
    if (n > 1 && n <= 100) {
      warnings.push(`${label} looked like a percentage (${n}); converted to ${n / 100}.`);
      n = n / 100;
    }
    if (n < 0 || n > 1) {
      warnings.push(`${label} out of range (${n}); reset to ${fallback}.`);
      n = fallback;
    }
    return n;
  };

  /** A daily room/ICU cap of 20%+ of SI is never real, so 1 or 2 here means "1%" / "2%". */
  const percentOfSI = (v: unknown, label: string, fallback: number): number => {
    const n = num(v, fallback);
    if (n >= 0.2 && n <= 100) {
      warnings.push(`${label} looked like a percentage (${n}); converted to ${n / 100}.`);
      return n / 100;
    }
    return fraction(n, label, fallback);
  };

  let si = num(r.baseSumInsured, 0);
  if (si <= 0) {
    warnings.push("Sum insured not found; assumed ₹5,00,000.");
    si = 500000;
  }

  // Room rent
  const room = obj(r.roomRentRule);
  const roomTypes: RoomLimitType[] = ["PERCENT_OF_SI", "FLAT_CAP", "SINGLE_PRIVATE_AC", "NO_CAP"];
  let limitType = roomTypes.includes(room.limitType as RoomLimitType) ? (room.limitType as RoomLimitType) : "NO_CAP";
  let limitValue = num(room.limitValue, 0);
  let maxDaily = Math.round(num(room.MaxDailyRoomRentINR, 0));
  if (limitType === "PERCENT_OF_SI") {
    limitValue = percentOfSI(limitValue, "Room rent % of SI", 0.01);
    const computed = Math.round(si * limitValue);
    if (maxDaily > 0 && Math.abs(maxDaily - computed) > computed * 0.01) {
      warnings.push(`Room cap ₹${maxDaily} disagreed with ${limitValue * 100}% of SI; using ₹${computed}.`);
    }
    maxDaily = computed;
    if (maxDaily <= 0) {
      warnings.push("Room rent percentage was 0; treated as no cap.");
      limitType = "NO_CAP";
    }
  } else if (limitType === "FLAT_CAP") {
    if (limitValue <= 0) limitValue = maxDaily;
    maxDaily = Math.round(limitValue);
    if (maxDaily <= 0) {
      warnings.push("Flat room cap had no amount; treated as no cap.");
      limitType = "NO_CAP";
    }
  } else if (limitType === "NO_CAP") {
    limitValue = 0;
    maxDaily = 0;
  }

  const icuTypes: IcuLimitType[] = ["PERCENT_OF_SI", "FLAT_CAP", "NO_CAP"];
  let icuLimitType = icuTypes.includes(room.icuLimitType as IcuLimitType) ? (room.icuLimitType as IcuLimitType) : "NO_CAP";
  let icuLimitValue = num(room.icuLimitValue, 0);
  if (icuLimitType === "PERCENT_OF_SI") icuLimitValue = percentOfSI(icuLimitValue, "ICU % of SI", 0.02);
  if (icuLimitType !== "NO_CAP" && icuLimitValue <= 0) {
    icuLimitType = "NO_CAP";
    icuLimitValue = 0;
  }

  // Co-pay
  const cp = obj(r.coPayRule);
  const ageRaw = cp.ageTriggerYears;
  const ageTrigger = ageRaw === null || ageRaw === undefined || num(ageRaw, 0) <= 0 ? null : Math.round(num(ageRaw, 0));

  // Waiting periods
  const wp = obj(r.waitingPeriods);
  const months = (v: unknown, label: string, fallback: number) => {
    const n = Math.round(num(v, -1));
    if (n < 0 || n > 120) {
      warnings.push(`${label} not found; assumed ${fallback}.`);
      return fallback;
    }
    return n;
  };

  // Sub-limits
  const subLimits: SubLimitRule[] = (Array.isArray(r.subLimits) ? r.subLimits : [])
    .map((s, i) => {
      const o = obj(s);
      return {
        procedureName: typeof o.procedureName === "string" ? o.procedureName.trim() : "",
        maxCapINR: Math.round(num(o.maxCapINR, 0)),
        citation: normalizeCitation(o.citation, `Sub-limit ${i + 1}`),
      };
    })
    .filter((s) => {
      const ok = s.procedureName && s.maxCapINR > 0;
      if (!ok) warnings.push(`Dropped an incomplete sub-limit entry (${s.procedureName || "unnamed"}).`);
      return ok;
    });

  const nmc = obj(r.nonMedicalConsumablesCovered);
  let estimate = fraction(nmc.estimatedDeductionPercentIfExcluded, "Consumables estimate", 0.08);
  if (estimate <= 0) estimate = 0.08;

  const rules: ExtractedPolicyRules = {
    policyName: typeof r.policyName === "string" && r.policyName.trim() ? r.policyName.trim() : "Uploaded policy",
    insurerName: typeof r.insurerName === "string" && r.insurerName.trim() ? r.insurerName.trim() : "Unknown insurer",
    baseSumInsured: Math.round(si),
    roomRentRule: {
      limitType,
      limitValue,
      MaxDailyRoomRentINR: maxDaily,
      icuLimitType,
      icuLimitValue,
      proportionateDeductionApplies: limitType !== "NO_CAP" && room.proportionateDeductionApplies === true,
      citation: normalizeCitation(room.citation, "Room Rent"),
    },
    coPayRule: {
      mandatoryCoPayPercent: fraction(cp.mandatoryCoPayPercent, "Mandatory co-pay"),
      zonalCoPayPercent: fraction(cp.zonalCoPayPercent, "Zonal co-pay"),
      ageTriggerYears: ageTrigger,
      citation: normalizeCitation(cp.citation, "Co-payment"),
    },
    waitingPeriods: {
      initialWaitingDays: Math.round(num(wp.initialWaitingDays, 30)),
      specificDiseasesMonths: months(wp.specificDiseasesMonths, "Specific-disease waiting period", 24),
      specificDiseasesList: (Array.isArray(wp.specificDiseasesList) ? wp.specificDiseasesList : [])
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim()),
      preExistingDiseasesMonths: months(wp.preExistingDiseasesMonths, "Pre-existing disease waiting period", 36),
      citation: normalizeCitation(wp.citation, "Waiting Periods"),
    },
    subLimits,
    nonMedicalConsumablesCovered: {
      isCovered: nmc.isCovered === true,
      estimatedDeductionPercentIfExcluded: estimate,
      citation: normalizeCitation(nmc.citation, "Non-payable items"),
    },
  };
  return { rules, warnings };
}

/** Every citation in a rule set, for grounding passes. */
export function allCitations(rules: ExtractedPolicyRules): BoundingBoxCitation[] {
  return [
    rules.roomRentRule.citation,
    rules.coPayRule.citation,
    rules.waitingPeriods.citation,
    rules.nonMedicalConsumablesCovered.citation,
    ...rules.subLimits.map((s) => s.citation),
  ];
}
