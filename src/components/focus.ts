import type { BoundingBoxCitation } from "../types/policy";

/** A request to show a citation in the PDF pane. `nonce` re-triggers the scroll on repeat clicks. */
export interface CitationFocus {
  citation: BoundingBoxCitation;
  nonce: number;
  /** What triggered it, shown in the evidence badge ("Trap #1", "Proportionate deduction", ...). */
  context?: string;
  /** Rupee impact of this clause in the current view, if any. */
  impactINR?: number;
}

export type FocusCitation = (citation: BoundingBoxCitation, context?: string, impactINR?: number) => void;
