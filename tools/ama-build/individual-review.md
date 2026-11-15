# AMA individual attachment review — 2026-11-15

Scope: chapters 1–17; 296 attachments (223 tables, 69 figures, four appendices), including continuation parts. Printed source pages 1–601. The supplied AMA Guides Sixth Edition PDF is the source; this is a rendering and transcription audit, not an independent clinical validation of the book.

## Individual evidence

`individual-review.csv` records every attachment separately. All 296 passed source-region non-whitespace character comparison. All 16,512 logical cells passed exact non-whitespace text order, rowspan and colspan comparison against freshly reconstructed source regions. Character frequency comparison alone does not establish reading order; cell comparison supplies the separate order check.

Every attachment was opened individually through its actual reader shortcut (appendices through their inline expand control) in Chromium, Firefox and WebKit at 1440 and 390 px: 1,776 successful opens. Checks include nonempty captions/content, cell text bounds, image loading, SVG reference integrity, transparent cell-art overlays, and reachable horizontal/vertical scroll edges. Appendix 16-A additionally requires a unified source object.

Full-content popup screenshots were captured for all 296 attachments and visually inspected in overview sheets; suspected problems were enlarged and checked against source-page crops. Overview inspection does not claim manual letter-by-letter proofreading of every long matrix. Exact cell/source comparisons, individual popup checks and focused pixel regressions complement that inspection.

## Applied fixes

- Table 11-2: wrap the ANSI footer instead of clipping its final characters.
- Table 12-7: transparent cell-art overlays and unit line height prevent neighboring extraction cells from hiding text. Removed synthetic vertical dividers from positioned charts; printed SVG rules remain intact.
- Figure 12-8 and Figure 15-20: apply a consistent paper/ink transform to the entire source artwork. Preserve white knockout strokes, raster paper, shaded cells and opacity masks; no blanket deletion of rectangles or masks.
- Table shortcut metadata: use the actual caption paragraph, retain caption continuation lines, and omit adjacent field labels, note text and footnote markers. Source notes remain in the full table.
- Appendix 16-A: reconstruct the source questionnaire as one aligned object instead of stacking its artwork above the text. Every original non-whitespace character is retained; all 1,760 page characters were safely mapped for existing highlights.
- Filled examples Figures 15-31, 16-13 and 17-7: add a responsive column reading view with an original-form toggle. Actual printed selection circles remain source artwork; blank scoring templates are expandable and no missing values are inferred. Hidden duplicate views are excluded from copy.

## Regression coverage

207 unit tests passed. Browser regressions cover the three filled reading views, all eight source figure forms/nine source pages, chapter search/page jump, Table/Figure tabs, captions, example columns, conversions, diagnosis selection, popup animation and source diagram integrity. Focused pixel checks cover knockout strokes and raster/vector paper continuity in all three browser engines at both widths.

Reproduction: `source-object-audit.py` and `source-cell-audit.py` require the locally supplied source PDF and PyMuPDF; `popup-audit.py` requires Playwright. Browser checks and unit tests do not require distributing the source PDF. Local detailed metrics and screenshots remain under `.local/ama-popup-audit`; the compact individual outcome ledger is tracked here.
