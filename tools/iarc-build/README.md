# IARC official classification snapshot

The website now uses the dataset embedded in the official classification application:
https://webapi.iarc.who.int/loc/loc.app.js
linked directly by https://monographs.iarc.who.int/list-of-classifications/ .

Official update: 2026-07-23 14:08 (CET), volumes through 142.
All raw official records and metadata are retained in iarc/data.json under official.
Every displayed entry uses its official group and CAS values. Records without one of the four requested group values remain in the raw data; no group is inferred for cross-reference records. HTML formatting tags in agent names are decoded to native text only.

The older build.py/report.json describe the superseded PDF import and must not be used to update the live dataset. Original PDFs are historical inputs only. The current UI has two columns (classification and agent), with CAS search; the source column, page buttons and PDF source viewer have been removed.
