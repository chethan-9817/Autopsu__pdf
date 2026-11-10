# Architecture

```
            ┌───────────────────── browser ─────────────────────┐
 PDF ──►  extractPolicy.ts ──► POST /api/extract ─┐              │
            │                                     │ (Vite server) │
            │                         geminiExtract.ts ──► Gemini (responseSchema)
            │                                     │              │
            ◄──────────── raw JSON ───────────────┘              │
            │                                                    │
       normalizeRules.ts   (deterministic repair + warnings)     │
            │                                                    │
       citationLocator.ts  (quote → box2d from pdf.js text layer)│
            │                                                    │
       ExtractedPolicyRules ──► claimSimulator.ts ──► receipt ──► WaterfallReceipt
                         └────► adversarialTraps.ts ──► TrapCards
                                                                 │
       PdfEvidenceCanvas ◄── CitationFocus (clicked line / trap) │
            └───────────────────────────────────────────────────┘
```

## Design decisions

### 1. The LLM compiles, it never calculates
Gemini output stops at `ExtractedPolicyRules`. All rupee math lives in `src/engine/`: pure functions with no I/O, no randomness and no AI. That makes the result reproducible, unit-testable (20 tests, including a 500-scenario property test that the receipt always sums to the bill) and explainable line by line.

### 2. A deterministic guard between the LLM and the engine (`normalizeRules.ts`)
Schema-valid JSON can still be wrong in meaning. The normaliser fixes the common failures and reports each fix to the user:
- percentages given as whole numbers (`20` → `0.2`, and `1` → `0.01` for room/ICU caps, since a 100%-of-SI daily cap is never real)
- a room cap that disagrees with its own percentage (it is recomputed from SI)
- swapped or degenerate boxes, missing sub-limit amounts, missing waiting periods (defaults: 30 days / 24 / 36 months)
- proportionate deduction claimed on a `NO_CAP` policy (forced off)

### 3. Bounding boxes: three sources, ranked by trust
| Source | When | Trust |
| --- | --- | --- |
| `generator` | Sample PDFs. We lay out the PDF ourselves (pdf-lib) and record the exact rectangle of each cited clause or table row. | Exact |
| `text-layer` | Uploads. We search the pdf.js text layer for the verbatim quote (full match, then 12/8/6-word head and tail windows, nearest page first) and join the matched glyph runs. | Exact for text PDFs |
| `model` | Fallback when the quote can't be found (for example scanned PDFs). This is Gemini's `box2d`. | Estimate |

The evidence badge always says which source drew the box. Citations with no box at all (for example the sum-insured line, which has no citation field in the schema) are grounded lazily when clicked.

### 4. API key stays on the server
`vite.config.ts` mounts `createApiMiddleware` on both the dev server and `vite preview`. The browser only calls `/api/extract`. `GEMINI_API_KEY` has no `VITE_` prefix, so Vite never bundles it.

### 5. One code path for photos and PDFs
A PNG or JPEG upload is wrapped into a one-page PDF (pdf-lib) before extraction, so the viewer, grounding and citations work the same way.

### 6. Sample policies are defined once
`src/samples/*Plan.ts` defines each clause's text once. That text is drawn into the PDF **and** used as the citation's `verbatimQuote`, so every sample quote is really in the PDF. Fixed metadata dates make the PDFs byte-for-byte reproducible.

## Engine semantics and assumptions

- **Order:** waiting → consumables → room excess → proportionate → sub-limit → co-pay → SI cap (matches the spec; co-pay comes after sub-limits, as in most Indian wordings).
- **Proportionate base** = bill − total room rent − consumables − medicines/implants/tests (`exemptMedicalCostsINR`), following IRDAI/HLT/REG/CIR/151/06/2020. ICU stays get no proportionate cut, only the ICU rent above the cap, and a receipt note says why. The exempt amount is a scenario input. The UI's *auto* mode uses `EXEMPT_COST_SHARE` per procedure in `claimSimulator.ts`. These are planning estimates, so the slider lets the user enter the real figure.
- **Model choice:** `gemini-3.8-flash` (GA Sep 2026), then `GEMINI_FALLBACK_MODELS` (default `gemini-3.6-flash`, `gemini-3.5-flash-lite`). Each attempt has a 75 s timeout and SDK retries turned off (`httpOptions.retryOptions.attempts = 1`), because the SDK's default 5× backoff on 503 made busy-model uploads look hung. Key errors (`isKeyProblem`) stop the chain; anything else moves to the next model. The response carries the model used plus a notice listing skipped models. `gemini-flash-latest` is deliberately not in the chain: it pointed at the same overloaded 3.8 model. `temperature` is only sent to 1.x/2.x models because Gemini 3.x deprecates sampling parameters; determinism comes from the strict schema plus `normalizeRules`.
- **ICU:** the procedure "Cardiac / ICU" uses the ICU cap and treats the daily-rate slider as the ICU rate.
- **Mandatory co-pay** applies at every age when `ageTriggerYears` is `null`, otherwise from that age. **Zonal co-pay** applies only when "Metro hospital (higher zone)" is on.
- **Initial waiting** compares `months × 30` days with `initialWaitingDays` (illness claims; accidents aren't modelled).
- **Procedure matching** (`procedureMatching.ts`) uses keyword aliases, for example Knee → "knee", "joint replacement", "arthroplasty". When several sub-limits match, the tightest one wins.
- **`SINGLE_PRIVATE_AC`** with no rupee figure is treated as "you chose the eligible room" (no excess), and the UI says so.

## Adversarial traps (`adversarialTraps.ts`)
Three fixed templates are run through the same simulator, so trap numbers always match the breakdown after "Try in simulator":
1. ₹3,50,000, 4 days, ₹8,500/day room, policy year 4. Headline = room excess + proportionate.
2. Knee (₹3L) and cataract (₹65k) at month 18. The worse one is shown, plus a look at the sub-limit just after the waiting period. Headline = waiting + sub-limit.
3. ₹5,00,000 ICU, 5 days at min(ICU cap, ₹10,000), age max(61, trigger), metro. Headline = consumables + co-pay.

Severity: ≥ 20% of the bill is **critical**, ≥ 5% is **warning**, otherwise **passed**.

## Front end
React 19 + Vite 8 + Tailwind 4 + framer-motion + lucide. State lives in `App.tsx` (no store needed). The PDF pane renders pages lazily (IntersectionObserver), draws through an offscreen canvas to avoid flicker on resize, and scales to the pane width × devicePixelRatio. On screens narrower than `lg`, the panes stack and the page scrolls normally.
