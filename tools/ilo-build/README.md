# ILO 2022 educational viewer

The site entry is 職專 → ILO (`#ilo`). Seven source-cited learning topics, the complete 23-film JPEG library, and guided recognition practice share an original-resolution pan/zoom viewer. Two-film comparison synchronizes relative viewport position and magnification, not anatomical registration.

## Sources and fidelity

- User-supplied `wcms_867859.pdf`, *Guidelines for the use of the ILO International Classification of Radiographs of Pneumoconioses*, revised edition 2022. UI citations use printed page numbers. Chinese learning notes are summaries, not an official translation.
- [ILO source and permitted educational use](https://www.ilo.org/resource/other/ilo-international-classification-radiographs-pneumoconioses).
- User-supplied `ilo-radiographs-jpegs` folder. All 23 originals in `ilo/images/` are byte-for-byte copies. Catalog entries record SHA-256, pixel dimensions, bytes, and Appendix C reference pages.
- Originals total 21,952,591 bytes; thumbnails total 308,273 bytes. Dimensions range from 1760×1860 to 3750×4200; all are 8-bit grayscale JPEGs. No PDF or full-document screenshots are hosted.
- `A_22_qq.jpg` is retained under its original name, but Appendix C p.27 describes film A as 2/3 q/r. The viewer explicitly notes this discrepancy.
- The highest t-series example is 3/3 t/s, not t/t. The u/u composite contains 0/0 and 1/1, 2/2, 3/3 examples and is retained from the 2011-D standards (p.26).
- Film markings remain visible in practice; the UI does not promise blinded testing. Practice scores are browser-local and are not a proficiency certification.

## Rebuild image assets

Requires Python and Pillow. From the repository root:

```powershell
python tools/ilo-build/import_images.py "A:/職醫/ILO標準片檔案/ilo-radiographs-jpegs"
```

This copies originals unchanged, creates max-320px navigation thumbnails, and writes `ilo/films.json`. Learning notes are maintained in `ilo/study.json` with page citations.

## Display and performance

- Original images load only when displayed. The library uses lazy thumbnails; leaving ILO releases decoded full-resolution images.
- Wheel/pinch zoom, pointer pan, double-click fit/zoom, keyboard arrows and +/−/0, 100%, fit/reset, and full-screen/fallback work without a DICOM library.
- 100% means one source pixel per CSS pixel, not physical calibration. Brightness/contrast are optional JPEG display filters, not DICOM window/level. Reset restores the source display.
- ILO describes these JPEGs as educational/informational, not for formal clinical classification. This web viewer does not implement DICOM, diagnostic display calibration, or calibrated measurements.
- Service-worker installation caches only code and catalog/notes, not the full image collection. Viewed images follow the site's existing network-first/offline-fallback policy.

## Verification

`tests/ilo.test.cjs` covers source checksums, catalog/reference integrity, native image containment, and cursor-anchored zoom. Browser QA additionally exercises all 23 originals, gestures including touch pinch, comparison/sync, full-screen, study navigation, quiz branches, image release, and 320/390px layouts.
