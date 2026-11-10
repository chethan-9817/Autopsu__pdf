# Workflow

## User flows

### A. Offline sample (default)
1. App start → `loadSampleProfiles()` generates both sample PDFs in the browser (pdf-lib, a few ms) and attaches the exact generator boxes to the pre-extracted rules.
2. `runAdversarialTraps(rules)` → 3 trap cards. `simulateHospitalClaim(rules, scenario)` → receipt.
3. Any slider or toggle change → the receipt recomputes synchronously (pure function, < 1 ms).

### B. Trap card → simulator → PDF
"Try in simulator" sets the trap's exact scenario (consumables and medicines/implants/tests back on auto), flashes the simulator, scrolls to it, and focuses the trap's clause in the PDF pane. The document button on a card only focuses the clause.

### C. Natural-language scenario bar
`parseScenario(text)` (regex, offline) fills only the fields it recognises and shows them as chips. It understands `₹3.5L`, `3,50,000`, `9k`, `1.2 lakh`, `Rs 65,000`, `month 18`, `18 months`, `2 years into the policy`, `year 2`, `4 days`, `age 62` / `65 year old`, `diabetic` / `pre-existing`, metro city names, and procedure words (knee, cataract, ICU, cardiac, robotic, surgery, hospitalised).

### D. See clause
Every breakdown row (once opened) and every policy-summary row calls `focusCitation(citation, context, impact)`. The PDF pane then:
1. uses `citation.box2d` if present, otherwise grounds the quote in the text layer on the spot;
2. smooth-scrolls to the box, dims the page slightly around it and highlights it in amber (two soft pulses, then steady);
3. shows the evidence badge with the clause ID, page, rupee impact, verbatim quote, and where the box came from.

### E. Upload policy (Gemini)
1. Top bar → **Upload policy**. The modal checks `/api/health`. If no key is set, it shows setup steps instead of uploading.
2. File (PDF ≤ 20 MB, or PNG/JPEG converted to PDF) → base64 → `POST /api/extract`.
3. Server → `gemini-3.8-flash` (or `GEMINI_MODEL`) with `responseMimeType: application/json` and the strict `responseSchema`, one attempt with a 75 s limit. If it is busy, rate-limited, too slow or retired, the server tries each of `GEMINI_FALLBACK_MODELS` in turn, and the report names the model that read the policy and why the others were skipped. A bad API key stops immediately.
4. Client → `normalizeRules` (repairs + warnings) → `citationLocator` grounds every citation (fixes wrong page numbers, replaces model boxes).
5. The report shows clauses located (x/y), treatment caps found, read time and every warning. **Check this policy** adds it to the top bar.

## Developing

```bash
npm run dev          # copies pdf.js assets, then starts Vite
npm test             # 23 tests
npm run typecheck
npm run build && npm run preview
npm run samples      # refresh public/samples/*.pdf after editing a sample
```

Changing a sample policy: edit `src/samples/classicPlan.ts` or `comprehensivePlan.ts`. Change the clause text in `clauses` (it feeds both the PDF and the quote). Give any new cited block a `cite: "<key>"` and reference it from `buildRules` with `cite("<key>")`. `buildSampleProfile` throws if a key is never placed in the document.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Top bar shows "Sample mode" | `GEMINI_API_KEY` is missing in `.env`, or the server wasn't restarted after adding it |
| Upload error "Every Gemini model failed: …" | Google is overloaded or the models were retired. Wait a minute and retry, or set `GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS` in `.env` to current models (see aistudio.google.com/docs/models) and restart |
| Report says "gemini-3.8-flash was busy (high demand)" or "was too slow", "so … read this policy" | Normal at peak times: a fallback model did the work. Nothing to fix |
| Upload error "Gemini rejected the API key" | Check `GEMINI_API_KEY` in `.env` (no quotes or spaces), then restart |
| Upload seems stuck | Each model gets at most 75 s; with all three busy, the worst case is about 4 minutes before an error |
| Upload error "larger than 20 MB" | Gemini's inline limit. Compress the PDF or upload only the wording (not the brochure) |
| Boxes say "estimated by Gemini vision" | The PDF has no text layer (scanned). Boxes are approximate; quotes and numbers are still checked |
| Fonts look wrong in the PDF pane | `public/pdfjs/` is missing. Run `node scripts/copy-pdfjs-assets.mjs` (it also runs before dev/build) |
| Port in use | `npm run dev -- --port 5180` |
