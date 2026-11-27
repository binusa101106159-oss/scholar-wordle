# LaDou Appendix A import

Scope: the user-supplied `Appendix A Biostatistics & Epidemiology.pdf`, LaDou 6e,
30 consecutive PDF pages. Original PDF is private input, never a public asset.

## Build

Run `python tools/ladou-build/import_appendix.py <source.pdf>` with PyMuPDF.
The importer produces a content-hashed chapter JSON, a catalogue and original
image assets. No dependency changes or changes to existing AMA data are needed.
The reader uses a separate `scholar-ladou-*` storage namespace and lazy-loads only
when 職專 → LaDou is selected. Future chapter entries can be added to the catalogue.

## Completeness

- 30 pages; 49 navigable headings.
- 17 native tables (numbered A–1 through A–6 plus 11 unnumbered study/example grids).
- Four original figures A–1 through A–4, each with its full source caption.
- 31 unique original figure/equation assets; no spinner images exported.
- Retain references on both PDF pages 17 and 30 and all original example numbers.
- A source-line audit matched all 1,261 visible body lines, ignoring whitespace,
  trailing caption periods and soft-hyphen encoding. Front matter is consolidated
  into one chapter header. Repeated access/download/IP banners are excluded.
- Table A–1's worked calculations are also included in its quick-view popup.
  The paired t-test table popup includes its PDF-page-13 continuation.

## Eight explicitly sourced repairs

The supplied PDF contains eight frozen loading spinners. These are not inferred
from statistical knowledge. They were compared visually with the same numbered
tables in the original LaDou 4e scan preserved by CDC/NIOSH:

https://stacks.cdc.gov/view/cdc/189249

https://stacks.cdc.gov/view/cdc/189249/cdc_189249_DS1.pdf

- PDF p.4 / Table A–1: mean expression, median expression, missing plus sign.
  Cross-reference: LaDou 4e printed p.790 / scan p.2.
- PDF p.18 / Table A–2: four mortality-rate expressions.
  Cross-reference: printed p.801 / scan p.13.
- PDF p.24 / Table A–5: Exposure Yes/No labels.
  Cross-reference: printed p.805 / scan p.17.

These additions have expandable source notes. The 6e publisher preview does not
provide these full tables anonymously; do not describe this as an exact 6e-image
recovery. Table A–2's infant mortality expression uses ×1000, but its original
example prints “100,000 live births”. Keep the original example and visibly flag
the unit conflict instead of silently changing it.

## Validation

`node tools/run-tests.cjs` runs the shared suite, including the new corpus checks.
`python tools/ladou-build/browser.py` exercises the actual app loader in Chromium,
Firefox and WebKit at 1440px and 390px: word/page search, selection highlights,
scrolling, settings, tab round-trips, clipboard, original image decode, and all
21 table/figure popups. `--url <site>` repeats against the deployment. Auth is
blocked in this isolated public-reader test; this does not validate owner login.

Stage intended public files before `python tools/build-public.py`: that publisher
copies tracked files only. Never stage `.local/`, the source PDFs or screenshots.
