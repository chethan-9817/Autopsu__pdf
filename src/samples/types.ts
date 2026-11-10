import type { BoundingBoxCitation, ExtractedPolicyRules } from "../types/policy";
import type { SampleDocument } from "./pdfGenerator";

export interface ClauseDef {
  clauseId: string;
  quote: string;
}

/**
 * A sample policy is defined once: its clauses feed both the generated PDF and
 * the pre-extracted rules, so every verbatimQuote is genuinely in the PDF.
 */
export interface SampleDefinition {
  id: string;
  label: string;
  tagline: string;
  fileName: string;
  clauses: Record<string, ClauseDef>;
  document: SampleDocument;
  buildRules: (cite: (key: string) => BoundingBoxCitation) => ExtractedPolicyRules;
}

/** Table rows are cited by their visible cells (minus the S.No column), joined with spaces. */
export function rowQuote(cells: string[]): string {
  return cells.slice(1).join(" ");
}
