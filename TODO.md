# TODO and decisions

## Open questions for you (defaults already built)

1. **Proportionate deduction base.** *Resolved 2026-11-09.* The engine follows IRDAI/HLT/REG/CIR/151/06/2020. Medicines (pharmacy), implants and medical devices, and diagnostics are exempt from the proportionate cut, and ICU charges never get one. A **Medicines, implants & tests** slider (auto = typical share per procedure) feeds the exempt amount. The classic sample's definition 1.1 was reworded to match.
   *Caveat:* only the draft circular's text and a summary of the final one could be read online. The summary says the final circular also lists consumables (already outside the base here). Check the final circular text before quoting it to judges.

2. **Gemini model.** *Resolved 2026-11-09.* `gemini-2.5-flash` shuts down on 1 Dec 2026. The default is now `gemini-3.8-flash` (stable since 2 Sep 2026). If the configured model is unavailable, the server retries once on `gemini-flash-latest`. `temperature` is no longer sent to Gemini 3.x (deprecated there).
   *Not yet tested live:* there's no API key in `.env`, so a real 3.8 extraction hasn't been run.

3. **Where the API key lives.** The spec implies calling Gemini from React, which would ship the key to every visitor.
   *Default built:* a small proxy inside the Vite server (`/api/extract`), so the key stays server-side. It works with `npm run dev` and `npm run preview`. For a static host (Vercel or Netlify) it would need porting to a serverless function.

4. **Bounding boxes from Gemini.** Gemini's `box2d` on PDF input is approximate.
   *Default built:* boxes are found from the PDF text layer using the verbatim quote, and Gemini's box is only a fallback for scanned PDFs. The badge says which was used.

5. **Sample insurers.** "Star/Care-style" was turned into two **fictional** insurers (Navakshitij, Tarangini) with a "fictional sample" footer, so the demo doesn't misrepresent real companies' products.

6. **PED waiting period.** IRDAI's 2024 master circular caps PED waiting at 36 months, so the classic sample uses 36 rather than 48. Older policies may still show 48, and the engine handles any value.

## Assumptions to know when presenting
- Co-pay is applied after sub-limits and proportionate deduction (clause 5.3 of the classic sample says so).
- Trap #3 assumes a 61-year-old in a metro hospital, so age-triggered and zonal co-pays show up. The card lists these assumptions.
- The specific-disease waiting period applies only to procedures on the policy's list (matched by keyword: knee/joint, cataract).

## Possible next steps
- [x] Pharmacy/implant/diagnostics exemption from proportionate deduction (question 1)
- [ ] "Hospital follows differential billing" toggle (IRDAI: no proportionate cut at hospitals that bill the same in every room category)
- [ ] Flag uploaded wordings whose definition of associated expenses still includes medicines/implants/tests (non-compliant clause to contest)
- [ ] Run a live extraction on `gemini-3.8-flash` once a key is in `.env`
- [ ] Sum-insured selector for policies that list several SI options
- [ ] Restore (top-up) and cumulative bonus effects on the SI cap
- [ ] Multi-policy compare view (same claim, two policies side by side)
- [ ] Serverless version of `/api/extract` for static hosting
- [ ] Gemini Files API for PDFs over 20 MB
- [ ] Playwright e2e tests in the repo (browser checks were run manually during the build)
