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

## 農保 and 四大計畫 (additional study categories)

PDFs the user supplied, read from `STUDY_GUIDES_SRC` (default `~/Downloads`), one folder per category:
`農保/人因性`, `農保/化學性`, `農保/物理性`, `農保/生物性` and `四大計劃` (the folder keeps the original spelling;
the site says 四大計畫). `farm` is only a parent category: build its four sub-categories.

```
export STUDY_GUIDES_SRC=/path/to/folder-with-農保-and-四大計劃
python3 build.py ../.. farm-e farm-c farm-p farm-b plans      # 22 guides; the official guides are left as they are
python3 review.py farm-e farm-c farm-p farm-b plans           # serve the site on :8765 first
```

- Categories nest (`CAT_PARENTS`): 農保 → 人因性 / 化學性 / 物理性 / 生物性; the reader shows them as collapsible groups.
- Credit line: 「資料來源：使用者提供之「<file>」PDF。」 (no claim of the OSHA open-data licence).
- `build_blocks(spaced=True)` for these PDFs only: they are double-spaced, so a line gap counts as a wrap up to
  1.35 × the document's usual wrap gap; a CJK line that stops up to two characters early still wraps unless it ends a
  sentence; a form blank (`____`) or a URL ends its line. The official guides keep the original rules until re-checked.
- Rules registered per guide and page (only checked against these PDFs):
  `OPEN_BODY` (farm-c02 p.4 表二: ruled header, one open box underneath), `CATEGORY_BANDS` (plans01 p.30 表4:
  rules-only table whose first column names a category for several tools), `FIGURE_REGIONS` (plans01 p.32: a chart of
  small pictures with labels under them, kept as one picture).
- `manual_tables.py`: tables the PDF prints only as a picture, transcribed by eye from the embedded image and counted by
  the QC as read: farm-p03 表二 熱指數表 (208 values + shading; identical cell for cell to 職業安全衛生設施規則 表三,
  `laws/annex/s07-3`), farm-p03 表三 熱危害風險等級, farm-b01 p.6 hazard-ratio table. Printed values are kept as printed
  (e.g. `9.72(6.51-14.50.)`).
- White text on a white page (hidden copies of headings for the PDF bookmarks) is not shown; the QC counts it as dropped.
- In an appendix that captions its own 表1 …, mentions of 表1 inside that appendix do not link to the body's 表1.
- `review.py`: DOM text of every block, every 表/圖 popup and appendix jump clicked, and one PDF-vs-app image per PDF
  page in `review/` (local QA only, not shipped).
