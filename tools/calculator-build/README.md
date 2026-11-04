# AAOS Lower Limb calculator

Source: user-provided `Copy of AAOS.xlsx`, Drive ID `17l4YMfNBw2HSiV0h_LH1e5wKs1LnkRlP`, modified2026-10-22. All three worksheets were inspected: Standardized & Normative Scores (503 populated rows), Instructions (44 populated rows throughB55/C48), Data Entry (510 populated rows;500 record slots). No embedded images. Q3-Q5 option cells D3:F9 are merged, not missing.

The site entry is 計算機. General arithmetic and the compact AAOS calculator are shown together, without subtabs; on narrow screens AAOS appears above arithmetic. The interface is a compact single bar containing seven unlabelled single-digit inputs, the standardized score and original English severity label. Q1-Q7 remain as accessible labels only. A valid digit automatically advances to the next field. Keyboard and beforeinput handlers replace the current digit even when the field is already focused; click/focus also select it. Fullwidth digits normalize to ASCII. Invalid codes stay in place. Backspace clears a filled field; from an empty field it moves back and clears the previous answer. Both keyboard and mobile beforeinput deletion are handled. Desktop activates Q1 automatically; touch devices do not autofocus/open a keyboard. Mobile fields request a numeric keyboard. Invalid codes clear stale results and show only the affected question and allowed range. Inputs and calculations remain in the page; responses are not persisted or sent to the source spreadsheet.

## Reproducible extraction

From the repository root, with the downloaded original workbook:

```powershell
python tools/calculator-build/import_aaos.py path/to/AAOS.xlsx
```

The standard-library extractor writes only `calculator/aaos.json`: question text/options, formula constants, severity bands, cell references and sourceSHA256. It does not export existing record data or the workbook itself.

## Scoring and provenance

- Instructions!A21:B28: Lower Limb Core Scale, seven items, Version2.0 instruments.
- Data Entry!B2:H9: question stems/options; D3:F9 are merged shared pain responses.
- Instructions!A6:A18: blank answers excluded; codes7 forQ3-Q5 count as missing; at least4 valid items required.
- Instructions!A30:C43 and calculation sheetB4:H4: Q1/Q2 `(answer-1)*5/4`, Q3/Q4/Q5/Q7 `answer-1`, Q6 `(answer-1)*5/6`.
- Calculation sheetJ4:L4: required4; population mean90.5138 andSD13.78281. Use these exact constants, not the rounded explanatory notes90.51/13.78.
- Standardized score `100-20*(sum(valid components)/valid item count)`; higher=better.
- Normative score `50+10*(unrounded standardized-90.5138)/13.78281`; preserve negative results.
- Instructions!A8/A48: display scores as nearest integers; do not round the standardized score before calculating the normative score. Half-ties round away fromzero.
- Instructions!A51:B55: normal100; mild75-99; moderate50-74; severe25-49; near-total/total0-24. Since the supplied bands are integers, the calculator applies them to the displayed rounded standardized score. These are the supplied workbook's categories, not a newly inferred AMA impairment class or WPI.
- Preserve Q6's source ordering: wheelchair5, other supports/person6, unable to get around7. Do not reorder or recode.
- The source calculation sheetN3/R3 explanatory prose contains repeated wording about a0/a5 that does not describe the raw-total range; the implementation follows the explicit Instructions formulas and actual cells. Its own misleading prose is not reproduced.

## Verification

`tests/aaos.test.cjs`: best/worst, all item rescalings, every missing-answer mask, exclusions, rounded boundaries, negative normative scores, invalid inputs and source-option integrity.

Private local parity check against all500 workbook rows:35 scored records matched cached raw totals, item means, standardized and normative scores within1e-7;465 incomplete records matched missing output. No record fixtures are committed.

Browser QA: all7 digits with automatic advance, repeated focused-field overwrite/click replacement, automatic desktop focus, no touch autofocus, numeric keyboard, invalid-code recovery, missing/code7 handling, best/worst results, onlyrequested UI elements, arithmetic-mode regression, state on tabreturn,320/390px/landscape, noJSerrors/horizontal overflow. The full original source wording and provenance remain in aaos.json and this README rather than the minimal UI.
