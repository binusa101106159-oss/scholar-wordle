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
