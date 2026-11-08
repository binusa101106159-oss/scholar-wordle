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
