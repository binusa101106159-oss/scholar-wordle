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
- `annex.py`: ruled tables (merged cells, page-split rows, nested forms, hidden gazette headers, underlined blanks).
- `links.py`: which 附表 a mention points to (own law, or another law named or abbreviated just before it).
- `catalog.py`: study order and tiers.
- `review.py`: side-by-side images of each 附表 (PDF | app) for the visual check.
