import type { SubLimitRule } from "../types/policy";
import type { ProcedureType } from "../types/simulation";

/**
 * Policy wordings never use our dropdown labels, so each procedure maps to the
 * phrases insurers actually print. Matching is a plain lower-case substring test:
 * deterministic, explainable, and easy to extend.
 */
const SPECIFIC_DISEASE_ALIASES: Record<ProcedureType, string[]> = {
  "General Hospitalization": [],
  "Knee Replacement": ["knee", "joint replacement", "arthroplasty", "joint surgery"],
  Cataract: ["cataract"],
  "Cardiac / ICU": [],
  "Robotic / Modern Treatment": [],
};

const SUB_LIMIT_ALIASES: Record<ProcedureType, string[]> = {
  "General Hospitalization": [],
  "Knee Replacement": ["knee", "joint replacement", "arthroplasty"],
  Cataract: ["cataract"],
  "Cardiac / ICU": ["cardiac", "heart", "angioplasty", "cabg", "bypass", "icu"],
  "Robotic / Modern Treatment": ["robotic", "modern treatment", "modern treatments"],
};

export function findSpecificDisease(procedure: ProcedureType, list: string[]): string | null {
  const aliases = SPECIFIC_DISEASE_ALIASES[procedure];
  for (const item of list) {
    const lower = item.toLowerCase();
    if (aliases.some((a) => lower.includes(a))) return item;
  }
  return null;
}

/** If several sub-limits match, the tightest cap wins (that is what the insurer will apply). */
export function findSubLimit(procedure: ProcedureType, subLimits: SubLimitRule[]): SubLimitRule | null {
  const aliases = SUB_LIMIT_ALIASES[procedure];
  const matches = subLimits.filter((s) => {
    const lower = s.procedureName.toLowerCase();
    return aliases.some((a) => lower.includes(a));
  });
  if (matches.length === 0) return null;
  return matches.reduce((min, s) => (s.maxCapINR < min.maxCapINR ? s : min));
}
