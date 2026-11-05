# California calculator data

The calculator implements the **January 2005 PDRS** eight-rank FEC workflow. It uses local lookup tables and never sends calculator inputs to the reference service.

Sources:

- Official 89-page schedule: https://www.dir.ca.gov/dwc/PDR.pdf
- Reference tool and table transcription by hsulihuang: https://github.com/hsulihuang/AMA_calculator/tree/main/tables
- Reference interface: https://hsuli-project-01.uc.r.appspot.com/

To reproduce, save the official PDF and `table21.csv`, `table22.csv`, `table23.csv`, `table41.csv`, `table51.csv`, `table61.csv`, `table62.csv` from that table directory, then run:

```sh
python tools/california-build/build.py --pdf /path/PDR.pdf --sources /path/tables
npm test
```

The builder requires pdfplumber. It independently extracts the official numeric tables and compares the reference transcription: 800 FEC cells, 808 occupational-adjustment cells, 1000 age-adjustment cells, 9630 occupational-variant letters, 215 FEC ranks, plus the spinal-accessory cross-reference rule. It also verifies the combination operation against all 4950 printed chart cells and writes that chart as an independent test fixture.

The two column-continuation pages print `17.01.02.XX` versus `17.01.02.00` for the same row. The builder aligns matching continuation rows and records both labels as aliases; numeric cells are unchanged. It never substitutes a variant for the spinal-accessory cross-reference or a fixed FEC rank for pain.

After adjustment, ratings are combined largest first, rounding **each step** to a whole percent. FEC adjustment is looked up in the printed table, retaining its rounding and 100% cap. Blank inputs do not become zero; valid zero ratings remain zero.

The interface identifies this as PDRS 2005. California rules for other injury dates and the later 1.4 modifier are not silently substituted. See https://www.dir.ca.gov/dwc/ClaimsAdministrators.htm for version applicability.

Age entry accepts completed years or a complete birthday plus an explicitly entered injury date. The calculator never substitutes today's date. Dates are parsed as year/month/day; four-digit years are Gregorian, while two- or three-digit years are ROC years. Explicit 民國/ROC prefixes are also accepted. Calendar dates and the injury/birthday order are validated without timezone conversion. Copied results include canonical dates and the derived injury age.

Impairment-number entry supports searchable suggestions and direct dotted or eight-digit codes. Occupation entry supports searchable official job titles and direct valid three-digit groups. The product's source-details panel is removed; provenance and rebuild instructions remain here.

## Searchable occupation index

```sh
python tools/california-build/occupations.py --pdf /path/PDR.pdf
```

This produces `calculator/california-occupations.json` from Part A, physical pages 29–53: 1812 official occupation rows. The extractor independently separates the two printed columns and preserves wrapped titles and industries. Numeric row anchors are collected before validating their group, including one shifted code in the instructor rows, so adjacent jobs cannot be accidentally merged. Empty columns, page-bottom text, record counts, group membership, and the PDF checksum are checked.

Both code and occupation entry use a single dark searchable combobox. The occupation list shows original English job titles, industries and official group numbers. Common Chinese terms expand search synonyms only; they do not assign a group. A job's group is used after an explicit selection, or after entering a valid three-digit code. Changing an unselected job query clears the previous group; saved older numeric groups remain valid. Copied results include the selected official job title and industry.
