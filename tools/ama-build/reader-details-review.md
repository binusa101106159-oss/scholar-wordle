# AMA 閱讀與單位換算（v214）

- 桌面右側「表格快覽」標題與 Table／Figure 頁籤並列；清單維持獨立捲動。
- 修正來源圖號與標題的字體高度不同造成的漏取。Figure 15-16／17／18／19 分別為 Flexion of Thumb MCP Joint、Neutral Position of Thumb MCP Joint、Thumb Radial Abduction、Adduction of Thumb；同步補回 15-15、15-20、15-21、15-22 的第一行及 16-2 的表單名稱。圖形本體未更動，衍生資料已重建。
- AMA 文字 Example 依原有欄位分卡：臨床資料在左、評分及 Comment 在右，手機改單欄；延續頁標示例號。只包裝原始節點，不改原文字元、來源 ID、順序或畫線位置。來源表單圖維持原本座標版型。
- 加州計算機的 Impairment no. 選定後，在同一欄下方持續顯示該診斷名稱；輸入值仍是原始代碼。
- 新增 DI→HI／UEI／WPI、HI→UEI／WPI、UEI→WPI、LEI→WPI。DI 必選手指，預設逐欄直接使用 Table 15-12 表值，也可明確切換逐層取整；未實作任意反向換算或跨肢體換算。重設僅清除此換算器。

## 換算來源與邊界

`tools/build-impairment.py` 從本站來源 c15／c16 的原生表格擷取資料，產生 `calculator/impairment.json`，記錄來源 HTML 雜湊。UEI／LEI 的 0–100 列逐筆對照 Table 15-11（420 頁）、Table 16-10（531 頁）。DI 直接對照 Table 15-12（421–423 頁）的各手指及各單位欄；該表缺 32% 列、重複 21% 列，保留缺列，不將重複列自行改名。32% DI 直接查表顯示明確訊息，可自行選逐層取整。

依 419 頁逐層換算時，手指權重為拇指 0.4、食／中指 0.2、無名／小指 0.1；HI→UEI 乘 0.9，每層取整後再查 WPI。這與 Table 15-12 各欄直接查表可能不同，例如小指 45% DI，直接表值為 5% HI／4% UEI／2% WPI，逐層則為 5% HI／5% UEI／3% WPI。LEI 1%→WPI 1% 使用原書表值，未以一條乘數覆蓋。

## 驗證

206 項自動測試通過，包括來源表格逐列比對、缺列與取整差異、非法輸入、四個指定圖名。`tools/ama-details-browser.py` 在 Chromium／Firefox／WebKit 各 1440／390 px 驗證並列頁籤、指定圖名、Example 欄位邊界、換算、局部重設及診斷名稱。全部 17 章共 379 個 Example 區塊包裝前後，每頁文字與來源 ID 順序完全一致。

此檢查不代表重新逐頁人工校對原書醫療內容；新功能維持原有評分來源，沒有新增個案評等或合併障害的判斷。
