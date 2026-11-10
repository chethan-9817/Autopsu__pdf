# PolicyAutopsy

**AI-powered health insurance loophole detector and deterministic claim-cut simulator for Indian (IRDAI) policy wordings.**

PolicyAutopsy is not a "chat with your PDF" app. It is a hybrid of three parts:

1. An **AI compiler**. Gemini reads the policy PDF visually, including multi-column Schedule of Benefits tables, and compiles it into a strict JSON rule set.
2. A **deterministic actuarial engine**. Pure TypeScript with zero LLM involvement, it computes every rupee the insurer will cut from a hospital bill.
3. **Visual PDF proof**. Every deduction links to the exact clause, which is highlighted (amber highlighter box) on the rendered PDF.

---

## Getting started

Requirements: Node.js 20+ (tested on Node 26) and npm.

```bash
cd "C:\Users\cheth\OneDrive\Desktop\ALLMY_imp(s)\Sceptix"
npm install
npm run dev            # http://localhost:5173
```

The two sample policies work immediately and fully offline. You do not need an API key for the demo.

### Enable live PDF upload (Gemini)

1. Get a key at https://aistudio.google.com.
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY=...`.
3. Optional: set `GEMINI_MODEL` (default `gemini-3.8-flash`, Google's current stable Flash model). If that model is busy (Google's 503 "high demand"), rate-limited, slower than 75 s or retired, the server moves on to `GEMINI_FALLBACK_MODELS` (default `gemini-3.6-flash,gemini-3.5-flash-lite`), and the upload report says which model read the policy.
4. Restart `npm run dev`. The top bar shows a green **Upload ready** dot.

The key is read **only by the Vite server** (`server/geminiExtract.ts`) and is never put in the browser bundle. Do not prefix it with `VITE_`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the `/api/extract` Gemini proxy |
| `npm test` | Engine, trap, parser, validation and model-fallback tests (23 tests) |
| `npm run typecheck` | TypeScript project check |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serves `dist/`, **with** the Gemini proxy |
| `npm run samples` | Writes the two sample PDFs to `public/samples/` (to try Upload policy on a known file) |

---

## Demo walkthrough (3 minutes)

1. **Open the app.** The *Navakshitij Suraksha Classic* sample loads. Under **Where this policy costs you money**, all three cards show **High risk**:
   - **Trap #1, a private room above the limit.** A ₹3.5L surgery in an ₹8,500/day room loses **25.5% (₹89,353)** to the room-rent cap and the proportionate deduction. The excess rent is only ₹14,000. The other ₹75,353 is the proportionate cut on surgeon, OT and nursing charges. Medicines, implants and tests (₹1,05,000 estimated) are protected by IRDAI and paid in full.
   - **Trap #2, planned surgery in year 2.** A knee replacement at month 18 is **100% rejected** (24-month specific-disease list), and after month 24 a ₹1.5L sub-limit still applies.
   - **Trap #3, co-pay and consumables on a big bill.** A ₹5L ICU bill with the ICU rate *inside* the cap still loses ₹1,10,000 to consumables and co-pay.
2. **Click "Try in simulator" on Trap #1.** The sliders move into place, the claim breakdown rebuilds, and the PDF scrolls to Section 3.1(b) and highlights it.
3. **Open the "Proportionate deduction" row** in the claim breakdown and click **"See clause · page 2"**. The formula reads `₹1,83,000 × (1 − 5,000/8,500) = −₹75,353`.
4. **Type in the scenario bar:** `Knee surgery in month 18, 4 days in a ₹9,000 room, total bill ₹3.5L`. It parses into chips and the receipt turns into a 100% rejection.
5. **Switch to *Tarangini Sampoorna Care*.** The same claims mostly come out **Low risk**, which shows that the clauses, not the hospital, decide the payout.
6. **Upload policy** (with a key): upload any real policy wording, or `public/samples/*.pdf`. The modal shows how many citations were grounded in the PDF text layer and every number it repaired.

---

## How the math works (deterministic engine)

Step 3b follows IRDAI's 2020 proportionate-deduction norms (IRDAI/HLT/REG/CIR/151/06/2020): pharmacy, implants and medical devices, and diagnostics are not "associated medical expenses", and ICU charges are never cut in proportion. The simulator has a **Medicines, implants & tests** slider. On *auto* it uses a typical share of the bill for the procedure (30% general, 40% knee, 35% cataract, 40% cardiac/ICU, 30% robotic). Set it from the real bill for an exact answer.

`src/engine/claimSimulator.ts`, applied in this order. Each step acts on what the previous step left payable:

| Step | Rule | Formula |
| --- | --- | --- |
| 1 | Waiting periods | Initial (days), pre-existing (`isPreExisting && age < PED`), specific disease (procedure on list `&& age < N`) → **100% rejected** |
| 2 | Non-medical consumables | If not covered: `− consumables` |
| 3a | Room / ICU excess | `(actual − cap) × days` |
| 3b | Proportionate deduction | `(bill − room rent − consumables − medicines/implants/tests) × (1 − cap/actual)`. Never on ICU stays |
| 4 | Sub-limit | `eligible − subLimitCap` if the procedure matches a sub-limit |
| 5 | Co-pay | `eligible × (mandatory [if age ≥ trigger] + zonal [if higher zone])` |
| 6 | Sum insured | `eligible − SI` if above SI |

Every line is rounded to the rupee once, and the payout is the bill minus the rounded lines, so the receipt always adds up. A 500-scenario property test enforces this.

---

## Folder structure

```
Sceptix/
├─ server/
│  ├─ geminiExtract.ts      # /api/extract + /api/health (key stays server-side)
│  └─ schema.ts             # Gemini responseSchema + extraction prompt
├─ src/
│  ├─ types/                # policy.ts (extraction contract), simulation.ts
│  ├─ engine/
│  │  ├─ claimSimulator.ts  # deterministic 6-step engine
│  │  ├─ adversarialTraps.ts# the 3 auto stress tests
│  │  ├─ scenarioParser.ts  # offline natural-language → sliders
│  │  ├─ procedureMatching.ts
│  │  ├─ format.ts          # ₹ Indian digit grouping
│  │  └─ claimSimulator.test.ts
│  ├─ extraction/
│  │  ├─ extractPolicy.ts   # upload pipeline
│  │  ├─ normalizeRules.ts  # deterministic repair of LLM output
│  │  └─ citationLocator.ts # verbatim quote → box2d via the PDF text layer
│  ├─ samples/              # 2 fictional policies + pdf-lib generator (exact boxes)
│  ├─ pdf/pdfjs.ts          # pdf.js setup
│  ├─ components/           # TopBar, RulesStrip, TrapCards, Simulator, WaterfallReceipt, PdfEvidenceCanvas, UploadModal
│  └─ App.tsx
├─ scripts/                 # copy-pdfjs-assets.mjs, export-sample-pdfs.ts
├─ ARCHITECTURE.md · WORKFLOW.md · TODO.md
└─ .env.example
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and [WORKFLOW.md](WORKFLOW.md) for the flows and troubleshooting. [TODO.md](TODO.md) lists the open questions and the defaults chosen for them.

---

## Disclaimer

Educational simulator. Both sample insurers and products are **fictional**. Real claim outcomes depend on the full policy wording, the hospital's billing and the insurer's or TPA's decision.

---

## Recent changes

- **2026-11-10**: Cleaner UI, with before/after captures in Figma (file "PolicyAutopsy – UI"): risk cards lead with one rupee figure and a two-line summary (More/Less); simulator grouped into Hospital stay, Patient and policy, and a collapsible Bill details; claim breakdown rows collapse to title + amount and expand to show the formula, explanation and clause.
- **2026-11-09**: Live upload hardened: `gemini-3.8-flash` was returning 503 "high demand" and the SDK's silent retries made uploads hang. Each model now gets one 75 s attempt, then the server falls back through `GEMINI_FALLBACK_MODELS`; key errors fail immediately. 23 tests.
- **2026-11-09**: Redesigned UI: clean light theme (white cards on a soft grey canvas, one dark accent, red/green only for money), bundled Inter font, plainer wording ("Claim simulator", "Claim breakdown", "See clause", "Upload policy"), amber highlighter for clause evidence, calmer motion.
- **2026-11-09**: IRDAI-correct proportionate deduction (medicines, implants and diagnostics exempt; no proportionate cut on ICU) with a new simulator slider; default model moved to `gemini-3.8-flash` (`gemini-2.5-flash` shuts down 1 Dec 2026) with an automatic `gemini-flash-latest` fallback; `temperature` dropped for Gemini 3.x; 20 tests.
- **2026-11-09**: First build: deterministic engine, 3 adversarial traps, natural-language scenario bar, waterfall receipt with PDF verification, PDF evidence canvas with exact and text-layer-grounded boxes, Gemini live upload with server-side key, 2 offline sample policies, 17 tests, responsive layout.
