# Reader rendering performance — v120

The user reports choppiness on mobile Chrome, Mac Safari and desktop Firefox. This change addresses client-side work without changing hosting, database rules or source content.

## Changes

- Laws no longer preload/index the entire library after opening the first law. Full search still calls the existing corpus loader when actually used. Tables load when opened.
- AMA records its visible source page using IntersectionObserver, rather than scanning geometry of all preceding pages. All pages/text remain in the DOM for copying; no source content or native tables are replaced.
- Avoid normalizing the entire AMA text tree when there are no existing highlight nodes to remove.
- Persistent reader surfaces retain gradients/bevels but use no live backdrop blur. Popups use a readable, nearly opaque inner sheet and static tinted backdrop. No per-frame full-viewport blur.
- Mobile/Firefox tab indicators use a short fade rather than stretching. Main-tab visibility scrolls only its horizontal track instead of scrolling ancestor containers.
- The scroll-to-top control observes routing changes and actual scrolling, not every child mutation across the document. Touch scrolling does not drive Wordle pointer-drift effects; idle tiles no longer reserve compositor layers.
- Service-worker cache v120 includes reading-performance.css.

## Evidence and limits

In an isolated Firefox session, opening the default law previously requested45 law JSON files plus78 annex JSON files. Afterward it requested1 law and no annex until a table was opened. This counts law-library resources only, not all assets or the test backend's polling traffic.

The 110-page AMA chapter15 test records1 JavaScript page-geometry read after a long scroll. Source data, table contents and ordering are unchanged.

Native law-table popups open/close successfully in Firefox, Chromium with a390px touch viewport, and WebKit with desktop/mobile viewports. Computed visible live-blur surfaces in the law reader are zero. WebKit mobile's measured5-second idle sample had no frame gap over50ms on this test machine; this is not a guarantee about physical phones or Macs.

Full independent-context mock-cloud interaction tests pass in Firefox and Chromium. A WebKit run passes the functional assertions but reports a mock /_test/state access-control exception during multi-context lifecycle handling; it is not claimed as a clean full WebKit cloud test. Separate WebKit native-popup checks and actual Firebase-SDK guest startup pass without JavaScript errors. WebKit on Windows is engine coverage, not a physical Mac Safari test.

The existing74 site tests pass. Review screenshots/benchmark scripts remain in .local. No real patient data was used in testing. Source PDFs/JSON were not rebuilt or modified.
