# laws-build

Converts the law PDFs (and their 附表 PDFs) in `E:\法規` into the JSON the 法規 tab reads (`laws/`).
Everything is copied word for word and checked character by character against the PDF.

```
pip install pdfplumber pymupdf pillow      # plus poppler-utils for pdftotext
export LAWS_SRC=/path/to/法規               # folder with the PDFs
python3 parse_laws.py out/laws a01 a02 ...  # law texts; args = tiers (S A B C) and/or law ids
python3 run_annex.py  out/annex a01 a02 ... # 附表 PDFs -> tables (index merges with earlier runs)
python3 manual.py     out/annex             # 附表 that are pictures in the PDF (設施規則 表一～三)
python3 build.py      ../.. S B C a01 ...   # write laws/: list EVERY tier/law that should be on the site
python3 review.py     a01 a02 ...           # PDF-vs-app images in review/ (serve the site on :8765 first)
node --test ../../tests/*.cjs               # site tests
```

- `parse_laws.py`: article text, chapters, numbered 項/款; prints OK/FAIL per law (exact character match).
- `boxtables.py`: tables drawn with ┌─┬─┐ glyphs inside articles become real tables.
- `formulas.py`: fractions drawn with ─ bars (TWA, noise dose) become stacked fractions.
- `annex.py`: ruled tables (merged cells, page-split rows, nested forms, hidden gazette headers, underlined blanks); interrupted Word borders and borderless columns use the source border-strip geometry. Scientific tables retain printed exponents, continue across page footnotes, and keep open-bottom spanning cells inside the grid. Mathematical expressions and plots use selectable SVG text and source vector paths.
- `links.py`: which 附表 a mention points to (own law, or another law named or abbreviated just before it).
- `catalog.py`: study order and tiers.
- `review.py`: side-by-side images of every PDF page and all native app content, plus real clicks on every article/notes 附表 link. Images are `review/<annex-id>-pNNN[-sNN].png`; long app content is split without cropping it away.

Use Poppler 22.12.0 to reproduce the existing article whitespace. Seed `out/annex/img/` with the published `laws/annex/img/` assets when starting from a fresh checkout: pixel-identical pictures reuse their original PNG bytes, so PNG compression-library changes do not rename approved assets.

`manual.py` also records visually checked image-only glyphs. The 18 small images in radiation annex 3 and the two in annex 2 are the character 𣱝 (U+23C5D), not equations; they become native text. No raster equation or page image is needed for those annexes.

Radiation tables keep the printed base even when it looks unusual (for example, `1.9×19⁻⁹`). Page joins extend the original spanning cells rather than leaving gaps that shift later columns. The site tests check full grid coverage for these tables and keep the separate isotope cells in annex 4 separate.

## 公保 (separate group in the 法規 tab)

The 7 公保 laws (`pub01`–`pub07`, tier `公保`) and their 9 附表 PDFs are read from `PUBLIC_LAWS_SRC` (default
`~/Downloads/公保`); `catalog.source_dir()` picks the folder per law. `pub01`'s only 附表 has no law-name prefix in its
file name and is listed in `EXTRA_ANNEX_FILES` (id `pub01-0`); `pub03`'s unnumbered 附表 is `pub03-0`.

```
export PUBLIC_LAWS_SRC=/path/to/公保
python3 parse_laws.py out/laws 公保
python3 run_annex.py out/annex 公保
python3 manual_public.py out/annex     # always after run_annex: it puts pub04-3 back
python3 manual.py out/annex
python3 build.py ../.. S A B C 公保    # build.py rewrites laws/text and laws/annex: list every tier
python3 review.py pub01 pub02 pub03 pub04 pub05 pub06 pub07
```

- `manual_public.py`: 公務人員退休資遣撫卹法 附表三 (pub04-3) prints its body only as a picture. Its 26 年資 rows ×
  11 percentages (286 values) are transcribed row by row from the 300 dpi image, listed explicitly (nothing computed),
  with the header, the split corner cell and the notes. No raster table is shipped.
- `annex.merge_continued`: a row split by a page break never repeats a check box (□) in the same column, and in a
  column of one numbered item per row, the next number on the next page starts a new row. Both checked against the
  公保 附表 (outputs unchanged) and the 四大計畫 forms.
