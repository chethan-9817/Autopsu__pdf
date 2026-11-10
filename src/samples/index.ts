import type { BoundingBoxCitation, PolicyProfile } from "../types/policy";
import { classicPlan } from "./classicPlan";
import { comprehensivePlan } from "./comprehensivePlan";
import { generatePolicyPdf } from "./pdfGenerator";
import type { SampleDefinition } from "./types";

export const SAMPLE_DEFINITIONS: SampleDefinition[] = [classicPlan, comprehensivePlan];

/** Generates the sample PDF and stitches the exact generator boxes into the pre-extracted rules. */
export async function buildSampleProfile(def: SampleDefinition): Promise<PolicyProfile> {
  const pdf = await generatePolicyPdf(def.document);
  const cite = (key: string): BoundingBoxCitation => {
    const clause = def.clauses[key];
    const box = pdf.boxes[key];
    if (!clause) throw new Error(`Sample ${def.id}: unknown clause "${key}"`);
    if (!box) throw new Error(`Sample ${def.id}: clause "${key}" is not placed in the document`);
    return {
      pageNumber: box.pageNumber,
      clauseId: clause.clauseId,
      verbatimQuote: clause.quote,
      box2d: box.box2d,
      boxSource: "generator",
    };
  };
  return {
    id: def.id,
    label: def.label,
    tagline: def.tagline,
    source: "sample",
    rules: def.buildRules(cite),
    pdfBytes: pdf.bytes,
    fileName: def.fileName,
  };
}

export function loadSampleProfiles(): Promise<PolicyProfile[]> {
  return Promise.all(SAMPLE_DEFINITIONS.map(buildSampleProfile));
}
