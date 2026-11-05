# Guide table grid audit — 2026-11-05

## Source and conversion

The catalog contains 195 guides (2,803 main-document pages). All 99 guides with native tables were rebuilt from their original PDFs: 1,979 main-document pages plus both s03 supplements (6 and 10 pages). Every conversion passed its source-character comparison. The 96 other guide body files remain unchanged, including 44 image-only source guides. Those scans are not claimed as native-table conversions.

Shaded rectangles and text underlines no longer create false column walls. Genuine shading-defined forms remain supported. Sparse cells are explicitly placed, connected header row spans remain in a single row group, and fixed column geometry is retained on narrow screens.

## Checks

- 622 native table instances, representing 364 distinct structures: rendered at 1,280px and 390px in Chromium, Firefox and Windows WebKit; no column alignment, span, text, or cell-overflow failures.
- All 287 published attachment entries opened through their actual links, with complete text and decoded images; no dangling attachment references or JavaScript errors.
- Independent PDF-coordinate extraction matched all 918 age/value cells in hearing tables 8 and 9. Both tables have nine columns. The female age-48 value at 500 Hz is printed as `II`; it is preserved, not changed to `11`.
- 79 Node tests pass, including published-grid coverage, sparse-cell placement and header-span regressions. Shared mock-cloud browser tests pass without real patient records or cloud writes.
- Baseline comparison: all 572 law and AMA files are unchanged. Source values were not hand-edited. Six newly recognized source illustrations remain images; native tables remain HTML.
- Pixel-identical source-image reuse retained 152 existing assets and avoided 18,029,861 bytes of duplicate image encodings.

## Review boundary

All native tables received automated structural and rendered-geometry checks; selected source examples received visual comparison. This is not a claim that every table was manually reviewed by eye. Windows Playwright WebKit is engine coverage, not a physical Mac Safari test.

## Glass performance

Transparent popup shells retain local contrast behind text. A separate background plane supplies blur at rest; it is removed during interaction and restored after 320ms without interaction. No full-viewport backdrop blur is introduced. Firefox's scrolling sample improved to approximately 13ms at the 95th percentile. Windows WebKit remained slow even with every visible blur/filter disabled, so that benchmark cannot establish physical Safari performance or identify glass as its cause.

Source inventories, conversion reports, baseline hashes, browser measurements and review images are retained locally under `.local/guide-qc/`; PDFs and test records are excluded from publication.
