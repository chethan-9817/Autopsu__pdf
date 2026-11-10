/**
 * Deterministic natural-language scenario parser. No LLM: works offline and
 * snaps the sliders instantly. Recognises Indian money shorthand (3.5L, 9k,
 * 1.2 lakh, Rs 9,000, ₹1.2Cr) and the phrases people actually type.
 *
 *   "Knee surgery in month 18, 4 days in a ₹9,000 room, total bill ₹3.5L"
 */
import type { ClaimScenario, ProcedureType } from "../types/simulation";

export interface ParsedChip {
  label: string;
  value: string;
}

export interface ParseResult {
  patch: Partial<ClaimScenario>;
  chips: ParsedChip[];
}

const MONEY = String.raw`(?:₹|rs\.?|inr)?\s*(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(lakhs?|lacs?|l|k|thousand|crores?|cr)?\b`;

export function parseINRAmount(num: string, unit?: string): number {
  const n = Number.parseFloat(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return Number.NaN;
  const u = (unit ?? "").toLowerCase();
  if (u.startsWith("cr")) return Math.round(n * 1_00_00_000);
  if (u.startsWith("l")) return Math.round(n * 1_00_000);
  if (u === "k" || u === "thousand") return Math.round(n * 1_000);
  return Math.round(n);
}

const PROCEDURE_PATTERNS: Array<[RegExp, ProcedureType]> = [
  [/\b(knee|joint replacement|arthroplasty|tkr)\b/i, "Knee Replacement"],
  [/\bcataract\b/i, "Cataract"],
  [/\b(robotic|robot|modern treatment|da ?vinci)\b/i, "Robotic / Modern Treatment"],
  [/\b(icu|iccu|cardiac|heart|angioplasty|bypass|cabg|stent)\b/i, "Cardiac / ICU"],
  [/\b(hospitali[sz](?:ation|ed)|admitted|admission|surgery|operation|dengue|typhoid|fever|appendix|appendicitis)\b/i, "General Hospitalization"],
];

export function parseScenario(input: string): ParseResult {
  const text = input.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const patch: Partial<ClaimScenario> = {};
  const chips: ParsedChip[] = [];
  // Spans already claimed by a more specific rule, so "₹9,000 room" is not read as the bill.
  const used: Array<[number, number]> = [];
  const claim = (m: RegExpExecArray) => used.push([m.index, m.index + m[0].length]);
  const isUsed = (start: number, end: number) => used.some(([a, b]) => start < b && end > a);

  for (const [re, type] of PROCEDURE_PATTERNS) {
    if (re.test(text)) {
      patch.procedureType = type;
      chips.push({ label: "Procedure", value: type });
      break;
    }
  }

  // Room rent: "₹9,000 room", "room of 9k", "9000/day", "9k per day"
  const roomRes = [
    new RegExp(`${MONEY}\\s*(?:/|per|a)\\s*(?:day|night)`, "i"),
    new RegExp(`${MONEY}\\s*(?:-?\\s*per\\s*day\\s*)?(?:single|private|ac|deluxe|shared|general|icu)?\\s*(?:ac\\s*)?(?:room|ward|icu)`, "i"),
    new RegExp(`(?:room|icu|ward)(?:\\s*rent)?\\s*(?:of|at|is|@|for|costing|=|:)?\\s*${MONEY}`, "i"),
  ];
  for (const re of roomRes) {
    const m = re.exec(text);
    if (m) {
      const v = parseINRAmount(m[1], m[2]);
      if (v > 0) {
        patch.actualDailyRoomRentINR = v;
        chips.push({ label: "Room / day", value: `₹${v.toLocaleString("en-IN")}` });
        claim(m);
        break;
      }
    }
  }

  // Policy age: "month 18", "18 months", "2 years into the policy", "year 2 of policy"
  const monthM = /\bmonth\s*(\d{1,3})\b/i.exec(text) ?? /\b(\d{1,3})\s*(?:months?|mo)\b/i.exec(text);
  const yearIntoM = /\b(\d{1,2}(?:\.\d)?)\s*(?:years?|yrs?)\s*(?:into|since|after|of|old)\s*(?:the\s*|my\s*)?(?:policy|cover|plan)\b/i.exec(text);
  const yearNM = /\b(?:year|yr)\s*(\d{1,2})\s*(?:of\s*(?:the\s*|my\s*)?(?:policy|cover|plan))?\b/i.exec(text);
  if (monthM) {
    patch.policyAgeMonths = Number(monthM[1]);
    claim(monthM);
  } else if (yearIntoM) {
    patch.policyAgeMonths = Math.round(Number(yearIntoM[1]) * 12);
    claim(yearIntoM);
  } else if (yearNM && !/\b(?:year|yr)s?\s*old\b/i.test(yearNM[0])) {
    // "year 2" means somewhere in months 13-24; use the middle of that year.
    patch.policyAgeMonths = (Number(yearNM[1]) - 1) * 12 + 6;
    claim(yearNM);
  }
  if (patch.policyAgeMonths !== undefined) chips.push({ label: "Policy age", value: `${patch.policyAgeMonths} months` });

  // Days: "4 days", "for 3 nights"
  const daysM = /\b(\d{1,3})\s*(?:-\s*)?(?:days?|nights?)\b/i.exec(text);
  if (daysM && !isUsed(daysM.index, daysM.index + daysM[0].length)) {
    patch.daysInRoom = Number(daysM[1]);
    chips.push({ label: "Days", value: `${patch.daysInRoom}` });
    claim(daysM);
  }

  // Patient age: "age 62", "62 year old", "62yo", "my 65-year-old father"
  const ageM = /\bage[d]?\s*(\d{1,3})\b/i.exec(text) ?? /\b(\d{1,3})\s*-?\s*(?:years?|yrs?|y)\s*-?\s*old\b/i.exec(text) ?? /\b(\d{1,3})\s*yo\b/i.exec(text);
  if (ageM && !isUsed(ageM.index, ageM.index + ageM[0].length)) {
    patch.patientAgeYears = Number(ageM[1]);
    chips.push({ label: "Patient age", value: `${patch.patientAgeYears}` });
    claim(ageM);
  } else if (/\b(senior citizen|senior|elderly)\b/i.test(lower)) {
    patch.patientAgeYears = 62;
    chips.push({ label: "Patient age", value: "62 (senior)" });
  }

  // Bill: "total bill ₹3.5L", "bill of 3,50,000", "costing 4 lakh", "₹5L ICU bill"
  const billRes = [
    new RegExp(`(?:bill|total|cost|costing|expense|expenses|estimate|amount|spent)\\D{0,15}?${MONEY}`, "i"),
    new RegExp(`${MONEY}\\s*(?:[a-z/]+\\s*){0,2}(?:bill|total|cost|estimate)`, "i"),
  ];
  for (const re of billRes) {
    const g = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const numStart = m.index + m[0].indexOf(m[1]);
      if (isUsed(numStart, numStart + m[1].length)) continue;
      const v = parseINRAmount(m[1], m[2]);
      if (v >= 1000) {
        patch.totalHospitalBillINR = v;
        chips.push({ label: "Total bill", value: `₹${v.toLocaleString("en-IN")}` });
        claim(m);
        break;
      }
    }
    if (patch.totalHospitalBillINR !== undefined) break;
  }
  // Fallback: the largest remaining amount written with a lakh/crore unit.
  if (patch.totalHospitalBillINR === undefined) {
    const g = new RegExp(MONEY, "gi");
    let best = 0;
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      if (!m[2] || isUsed(m.index, m.index + m[0].length)) continue;
      const v = parseINRAmount(m[1], m[2]);
      if (/^(l|lakh|lac|cr)/i.test(m[2]) && v > best) best = v;
    }
    if (best > 0) {
      patch.totalHospitalBillINR = best;
      chips.push({ label: "Total bill", value: `₹${best.toLocaleString("en-IN")}` });
    }
  }

  if (/\b(pre[- ]?existing|ped|already (?:had|have)|known case of|diabet(?:ic|es)|hypertensi(?:on|ve)|bp patient)\b/i.test(lower)) {
    patch.isPreExisting = true;
    chips.push({ label: "Pre-existing", value: "Yes" });
  } else if (/\b(not pre[- ]?existing|new condition|no history)\b/i.test(lower)) {
    patch.isPreExisting = false;
    chips.push({ label: "Pre-existing", value: "No" });
  }

  if (/\b(metro|zone a|mumbai|delhi|ncr|bengaluru|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad|surat|gurgaon|gurugram|noida)\b/i.test(lower)) {
    patch.treatedInHigherZone = true;
    chips.push({ label: "Zone", value: "Metro / Zone A" });
  }

  return { patch, chips };
}
