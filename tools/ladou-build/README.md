# LaDou Appendix A import

## Fourth chapter batch (chapters 16–20)

`import_batch04.py <folder>` imports all 114 source pages: 28 normal-text tables,
19 numbered figures and 19 original image panels. All 3,872 valid body lines
match the rendered text after whitespace normalization. Only three sparse
superimposed glyphs on Chapter 19 p.30 are omitted; the intact line is retained.
All 114 original pages were read and visually reviewed, including references.
Table 16–1 joins pp.1–2. Test/result pairs in Table 16–3 and the paired
antigen/exposure/syndrome entries in Table 19–4 use semantic rows and shared
cells. Table 20–3 retains its two-level header and footnote without swallowing
subsequent body paragraphs. Source lists stay lists; no clinical data is inferred.
`batch04-browser.py` checks every page, all 47 objects, original image decoding,
word/page search and overflow in Chromium/Firefox/WebKit at 1440px and 390px.
Public-reader checks deliberately block Firebase; account sign-in is not tested.

## Third chapter batch (chapters 11–15)

`python tools/ladou-build/import_batch03.py <folder>` imports the five supplied
PDFs (18, 20, 39, 15 and 46 pages): 138 pages, 23 tables, 27 numbered figures
with 28 original image panels. Every source page was read and visually reviewed.
All 4,737 valid body lines match the resulting HTML after whitespace normalization.
The two sparse duplicate glyphs `p` / `yp` in Chapter 15 p.31 overlap the intact
Trichosporon / Summer-type cells; only these duplicates are omitted.
Chapter 14 p.15 is blank in the source and retains its page target and blank flag.

All table regions use the original vector borders to align normal selectable
text. This avoids false margin columns in the PDF table detector. Table 14–1
joins pp.1–3; Tables 15–3, 15–5 and 15–6 each join three pages with their category
cells intact. The borderless noise/exposure tables use one semantic row per
paired entry. Original blank cells, numeric signs, superscripts, captions and
source notes are preserved. Figure 15–8 combines both panels from pp.26–27 with
the full caption on p.25. No images are reconstructed or fetched externally.

`batch03-browser.py` exercises all 138 page targets and all 50 quick-view objects
in Chromium, Firefox and WebKit, at 1440px and 390px: image decode, complete
captions, word/page search, popup controls and overflow. Screenshots wait for
image decoding and paint, not only network completion. Public-reader tests
block Firebase deliberately and do not validate account sign-in.

## Second chapter batch (chapters 6–10)

`python tools/ladou-build/import_batch02.py <folder>` imports the five supplied
PDFs (41, 3, 35, 37 and 17 pages): 133 source pages, 20 native table objects,
32 numbered figure objects and eight original equation images. All 4,122 visible
body lines match the imported HTML after whitespace normalization. Original
chapter front matter is consolidated into each reader header. Access/download
banners and IP addresses are excluded. No external reconstruction was used.

All 133 rendered source pages were reviewed. Captions and figure panels can span
several source pages: e.g. Figure 6–10 has two panels and Figure 8–2 has four.
Figure 6–18 uses the intact 895×532 source JPEG rather than its duplicated/cropped
526px PDF tile. Empty printed pages after moving a figure retain their page
targets and links to the complete object; they are not described as missing.

Table 9–8 combines four illustrated pages into 18 content/group rows, with its
eight original images inside the corresponding cells. Tables 10–1 and 10–2 keep
their continued rows; the Fish oil row on pp.15–16 is joined column by column.
One-column diagnostic tables remain indented native text. Table 6–3 retains its
three aligned numeric lines per cell. Footnotes stay in the quick-view objects.
Chapter 9 p.30 has 18 sparse duplicate glyph fragments superimposed on the intact
"restore function..." sentence; only the duplicates are omitted. Typography-only
spacing fixes include `heightwhen` → `height when` and `I n` → `In`.

Long quick-view captions stay complete below the image in the scrollable body,
so mobile controls remain visible. `batch02-browser.py` checks all 133 page
targets and all 52 objects, image loading, long captions, word/page search and
mobile overflow in Chromium/Firefox/WebKit. Existing Appendix and first-five
chapter browser scripts cover regression paths. Public-reader browser tests
block Firebase requests deliberately and do not validate authenticated sessions.
Source PDFs, contact sheets, SHA-checked rebuild caches and audit logs remain
private in Downloads or `.local/`; only content JSON and used artwork publish.

## First chapter batch (chapters 1–5)

`python tools/ladou-build/import_chapters.py <folder>` imports the five exactly
named user files. This batch adds 41 source pages (including the blank printed
tail page 6 in Chapter 1), 82 headings, four tables and one original figure.
All 1,447 visible body lines are matched against the generated HTML. No missing
formula or spinner was found in this batch. Figure 2–1 has its source caption
on PDF p.1 and its image on p.2; the reader places the complete original image
with that caption and records both source pages. Table 2–1 is a one-column
questionnaire, so it is transcribed as indented paragraphs, not an empty grid.

The chapter selector stays compact rather than adding one sidebar card per
chapter. Page targets derive from each chapter's IDs; reading positions and
highlights are isolated by chapter. Storage still uses the existing account
store: guest state is memory-only and resets on reload. This change adds no
patient disk cache or authentication changes.

`python tools/ladou-build/batch-browser.py` verifies all five chapters in three
engines at desktop/mobile sizes, all new objects, chapter word/page search,
separate marks and reading positions, and clean guest reload. Private source
PDFs, contact sheets and audit logs remain under `.local/` or Downloads.

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
