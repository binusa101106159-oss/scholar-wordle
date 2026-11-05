# IARC supplied-PDF import

Run `python tools/iarc-build/build.py --src /path/to/IARC` with PyMuPDF installed.
Input files are IARC_group_1.pdf, IARC_group_2A.pdf, IARC_group_2B.pdf and IARC_group_3.pdf.

These are the user's Wikipedia-print PDF snapshots, not a current official IARC dataset. The importer preserves each PDF's grouping, spelling, duplicates, reference markers and original page text. It does not correct or merge conflicting classifications. The application links to the official classifications page separately.

Square path markers identify list entries independently of text extraction. Continuations and nested lists retain their source hierarchy. All non-whitespace characters in the agent sections must match the reconstructed entries in order. An independent marker scan checks that no entry was skipped. Full text for every page, including introduction, notes, references and external links, is retained for the native source dialog. No PDFs or screenshots are shipped.

Current import: 35 pages; Group 1:132, 2A:96, 2B:322, 3:499 list entries. Six nested entries in Group 3 are retained under their original parent. Printed oddities such as Aralditeâ, sulfde, Perfuorooctanesulfonic, Merphalan, Medphalan and CI DIrect Blue 218 remain unchanged. See report.json and data.json source SHA256 values for validation.

The main IARC tab is immediately left of 職專. Search and group filtering operate on a prebuilt normalized index. Rendering starts with 60 rows and loads further rows on demand; there are no result-count summaries. Source dialogs show native text from the cited PDF page. A source query never changes a PDF classification.
