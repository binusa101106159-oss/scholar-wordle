# 寬螢幕閱讀與獨立表格捷徑欄

## 變更範圍

適用法規、指引、特做、AMA。1100px以上橫向視窗採全寬左對齊閱讀版面，左目錄、中央內文、右表格捷徑各自占一欄。左目錄仍可收合；沒有表格時不保留空白右欄。閱讀設定的文章寬度仍可使用。

新reader-tables.js只建立捷徑按鈕，轉送點擊給原始按鈕，以沿用各閱讀器既有表格載入、快覽、彈窗及前後表導覽。沒有複製表格正文，也沒有新增整頁模糊效果或監聽整份文件的變動。

桌面將原標題區捷徑隱藏；手機、直向與窄視窗仍顯示原標題區捷徑。右側清單自行overflow-y捲動，不跟隨內文。法規已勾選頁及搜尋結果隱藏一般全文時，同步隱藏右欄。切換文章與載入中同步更新清單，避免殘留前一份捷徑。

## 驗證

- Chromium／Firefox／WebKit × 1440px／390px × 四閱讀分頁，共24組：捷徑數量一致、桌面全寬左移、右側位置、內文捲動不移動右欄、表格按鈕轉送與原彈窗、手機原標題捷徑、桌面切手機再返回均通過，無頁面錯誤及水平溢出。
- 指引e03的15個附件在1920px實際滑鼠滾輪測試：右側清單會捲動，文章scrollTop維持不變；左欄收合後右欄仍顯示。
- AMA c15第15章40個表格捷徑與原表單數一致，能開啟既有快覽彈窗。
- 139項Node測試全部通過；git diff --check通過；全部JSON來源與內容資料無變更。
- 視覺檢查1920px指引左右版面及手機恢復原版。快取版本v182。

## 表單、AMA、特做與IARC後續精簡

- 表單切換列改到左側，問題區獨立捲動；移除每份問卷頂部的副標與整段介紹。題目內的作答提示、原選項、滑桿與計分不變。手機使用左側可展開選單，支援上下方向鍵、Home/End與Escape。
- AMA移除大型章節標題卡，保留隱藏的無障礙章節標籤及手機表格捷徑。選章聚焦正文，不再聚焦隱藏的大標題。
- 特做完整版的封面段落移入同一精簡標題區，保留來源字串、原block IDs及文字offset；完全相同的下一頁重複標題不重複顯示，有既有畫線時仍可顯示。不同的原文標題不合併隱藏。
- IARC搜尋與分類移至左側，結果區獨立捲動；手機使用搜尋／分類側欄，選取分類後回到結果。
- 三引擎1440/390px檢查表單切換及作答、IARC搜尋asbestos及Group1篩選、特做四段封面文字／來源定位、AMA無大型卡片及原表格彈窗。三引擎320px與側欄鍵盤操作通過。以虛構標記核對特做作者段的原block ID與offset畫線仍正確顯示。
- 139項Node測試通過，來源JSON完全未變更，git diff --check通過。快取v183。

Residual cover-title review (2026-11-08): audited the first body-page title in all 32 full health guides. Match multi-paragraph titles as a whole and normalize only the source title suffix variants 健康檢查指引 / 健康管理分級建議指引. Hide duplicate presentation while retaining original nodes, IDs, and source text for annotations. Chromium, Firefox, WebKit: 32/32 repeated titles absent from body, all original paragraph text retained, first real section visible; mobile 390px no overflow. 139 Node tests pass; no JSON changes. Visually reviewed full13 screenshot.

2026-11-08: compact first health section spacing after hidden repeated PDF title; retained source blocks. Forms viewport height now measured below primary navigation and constrained against shared flex sizing; actual wheel scrolling verified at center in Chromium/Firefox/WebKit at 1440 and 390px. Moved form progress/reset/submit to sidebar (mobile drawer), retained native form association for submit validation; removed source footer. Sidebar submit detects missing answer; slider still works. 139 tests pass; no JSON changes.

2026-11-14 reader performance:
- Bounded native popup DOM reuse for laws/guides/health/AMA, A/B/A retaining exact table node identity and text. Two detached entries per reader, global 25,000-element ceiling; 10,000 when deviceMemory reports <=4GB. Oversized tables remain usable but are not retained. Search terms are part of the cache key; AMA SVG popup IDs remain isolated. Added offline shell asset.
- Offscreen native article/paragraph/table layout uses feature-detected content-visibility:auto, retaining all source text and DOM anchors. Print restores normal layout. Legacy pixel positions use exact layout; new positions store content anchors. Long jumps settle across layout frames and yield to user interaction.
- AMA construction batches reduced from 12ms to 6ms with scheduler.yield where supported and timer fallback.
- Local Chromium, 1440x900, 4x CPU throttle, Civil Code 1,439 articles, click to two animation frames: no deferred layout 1875/1896ms; deferred 566/549ms. This is a local layout benchmark, not a network or physical-device guarantee. AMA15: 122,418 elements retained; 586ms with 300ms measurement wait included, no observed >50ms long tasks in this run.
- Chromium/Firefox/WebKit x 1440/390: all four readers A/B/A exact native table identity/text, source forwarding, independent shortcut rail and resize pass (24 each). Article1000 jump, legacy pixel restore, content-anchor restore, real selection/highlight, full-text search result jump, guide/health section jump pass in all three engines. Browser-engine and viewport tests are not actual iPhone/Android/Linux/processor tests.
- Five new performance unit tests pass (identity/search key isolation, eviction, global/low-memory budgets, oversized bypass, anchor settlement). Full suite: 172 tests, 170 pass, two pre-existing laws.test.cjs catalog-order assertions fail after prior additional law categories; laws JSON and that test were unchanged by this work. No source JSON modified.

2026-11-14 reliability: service worker no longer forces skipWaiting/clients.claim or automatic document reload. Installed shell is cache-first within its version; all assets must install successfully before activation. Cross-origin auth/Firestore bypass unchanged. Public app startup runs independently of Firebase; private panels remain inert until initial account resolution. Initial owner hydration notifies existing views; input notifications retain editing protection. Cases refresh on identity transition. Cloud startup failures do not reset public memory. Legacy seed scripts are not imported into progressive startup. Tests: 176/176 pass, including offline shell, no forced worker takeover, auth bypass, progressive hydration, existing sync/reconnect/sign-in suites. Chromium/Firefox/WebKit with Firebase SDK requests aborted: public laws usable and calculator guest inputs remain intact after account failure. Existing two catalog assertions updated for the already-published 農保 tier, preserving medical/basic order checks. No law or questionnaire source JSON changed.

2026-11-14 lazy loading/release gates: feature modules now load once on first tab use, including ordered shared calculator dependencies for forms/cases/calendar. Failed loads expose an in-place retry; skipped feature modules cannot block public boot. Foreground feature source bytes before selective loading: 471941; laws-only feature bytes: 79716 (not total page transfer; background offline shell installation still prepares coherent assets). Reader pictures use lazy loading and async decoding. Long popups defer complete source table blocks only, not rows; search-highlighted tables retain eager geometry. No source JSON changed.
Validation: 178 Node tests pass. tools/smoke-browser.py passes Chromium/Firefox/WebKit at 1440/390, covering lazy routes, Firebase unavailable startup, private guest guard, fictional case draft retention; four-reader table A/B/A and layout/resize checks also pass across all six configurations. GitHub Actions Pages workflow requires Node suite + all three browser checks, packages tracked public assets only, then deploys via needs:check. Local/private .local files, tests and tooling are excluded from public artifacts. All service-worker shell assets verified in the package. Playwright 1.64.1 availability confirmed via PyPI.

2026-11-14 resilience checks: tools/resilience-browser.py performs 15 rounds per engine (Chromium/Firefox/WebKit), 60 tab switches plus 15 table popup cycles each. DOM count after warmup/end: 11841/11841 in all three; Chromium forced-GC used JS heap 6049836 -> 6148232 bytes in the final local run. This short bounded check is not a long-duration or total-process-memory guarantee. Chromium startup also uses 150ms latency/200KB/s; real browser offline mode is exercised during a rejected fictional patient save. Two independent store clients test separate-field concurrent patient saves, stale-edit deletion protection, and 100 offline edits merged with another device preference update. These use a simulated transaction server, not two physical devices or production Firestore.
Fixed case drafts lost during SPA tab/history navigation: keep the same unsaved form in memory while suspended, restore dialog/caret on return, and retain unload warning for suspended dirty drafts. Explicit cancel still discards. Added visualViewport keyboard-height dialog sizing, frame-coalesced events, pinch-zoom exclusion, and 16px touch case inputs. Touch/back navigation, 390px width, reduced 400px viewport, and offline-save draft checks pass all three engines; no actual iOS/Android software keyboard or native back gesture tested. Added resilience script to release gate and keyboard geometry unit checks. 184 Node tests pass. No patient source or law data changed.
