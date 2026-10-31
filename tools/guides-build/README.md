# guides-build

Converts the 職業病認定參考指引 PDFs into the JSON the 指引 tab reads (`guides/`).
All text comes from the PDF by program and is checked character by character against it.

```
pip install pdfplumber pymupdf pillow           # plus poppler-utils
export GUIDES_SRC=/path/to/職業病認定參考指引     # folder with one sub-folder per category (人因性危害, 化學性危害, …)
python3 build.py ../..                           # every guide in guides_catalog.GUIDES
python3 build.py ../.. e01 e05                   # only these; guides/index.json keeps the others
node --test ../../tests/*.cjs
```

- `guides_catalog.py`: categories and guides in the official OSHA list order (ids `e01`…: category letter + place in the list).
- `build.py`: reuses `../laws-build/annex.py` unchanged for tables (merged cells, tables split over pages, repeated
  headers), pictures and vector drawings; adds running headers/footers, paragraphs that continue across pages,
  hanging indents measured from the page, 一、/(一) headings, the cover block, lists printed in columns, captions for
  表/圖 (each becomes an attachment in `guides/attach/`) and links from the text to them.
- QC (printed per guide, OK/FAIL): every printed character of the PDF must be in the data, as a character count,
  apart from the running header/footer lines and the table header rows repeated on continuation pages, which are
  listed in `report.json`.
- Wingdings bullets (U+F06C, no Unicode meaning) are shown as ●.
- Output: `guides/index.json`, `guides/text/<id>.json` (`blocks`: `h`, `p` with `ind`/`hang` in em and `links`,
  `table`, `img`, `cols`), `guides/attach/<id>-t1.json` / `-f1.json` (表一 / 圖一), `guides/attach/img/`.
