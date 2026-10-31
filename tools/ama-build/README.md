# AMA 原文轉換

這是獨立的 AMA 轉換器；不修改法規、指引、遊戲或其轉換器。

## 來源與範圍

使用使用者提供的完整版 `AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf`。目前支援 c01–c03，原書第 1–46 頁，對應完整版 PDF 第 26–71 頁。來源共 659 頁。`AMA_SRC` 可指定完整版 PDF 的絕對路徑；預設為 `A:\職醫\AMA\AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf`。

```powershell
$env:AMA_SRC = 'A:\職醫\AMA\AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf'
python tools/ama-build/build.py c01 c02 c03
python -m http.server 8765
# 另一個終端機，使用同一 Python 環境與 Playwright 瀏覽器設定：
python tools/ama-build/review.py c01 c02 c03 --images
```

需要 Python 3.11+、PyMuPDF、Pillow、Playwright 及其 Chromium。影像比較與完整稽核寫入 `.local/ama-part1/`，不放入網站。網站只讀取 `ama/index.json`、各章 JSON，以及 AMA 自己的 JS/CSS。

## 原文與版面

- 所有正文、圖說、表格欄位、附註、參考文獻與圖內文字，都取自 PDF 的原始文字座標，不以人工重打或翻譯補字。
- 版面註記只記錄原書頁碼、物件範圍與物件類型，不含正文或表格數值。PDF 的 cropbox 與 mediabox 不同；本轉換器一致使用裁切後座標。
- 每個保留字元恰有一個歸屬物件；輸出後另做 HTML 文字回讀檢查。忽略版面空白後，每頁字元總數與字元頻次必須相同。每個表格儲存格另核對字元順序與跨列、跨欄。
- 跑馬頁首、書名頁眉、頁碼與書邊章節標籤另列稽核；閱讀器提供原書頁碼。三張章首裝飾分隔線以原生水平線呈現。
- 省略三張章首重複的淡色裝飾徽記；Table 1-5 內的原始裝飾圖形保留為向量。
- 保留原文的行末連字號、拼字、數字、標點與上標，不做文字校訂。
- MathematicalPi 的編碼依 PDF 字型 Encoding/Differences 解碼；目前 H11001 為 `+`、H11005 為 `=`。未知字形或不可讀字元會中止建置。
- 表格為原生 HTML，保留空白格與合併格；Table 1-5 的填色表頭不視為跨列合併。Figure 2-3 報告表及 Appendix 3-1 問卷也使用原生欄位與表格。
- 真正的圖形使用原書向量路徑，圖內字仍可選取。水平或垂直線段的邊界面積為零，不能用面積交集判斷是否保留。沒有整頁影像或 PDF 嵌入。
- 正文改為單欄閱讀；採瀏覽器字型，空白填寫區和換行適應視窗，因此不承諾與印刷版逐像素相同。文字與表格數值不近似。

## 引用與閱讀功能

Table/Tables、Figure/Fig.、Appendix/Appendixes 的引用，只連到已匯入且確實存在的物件；複數引用分別連到各目標，也支援跨章。未匯入的 Appendix B 與 Combined Values Chart 保留原文，暫不加連結。

17 章維持原書順序；尚未匯入的章節顯示準備中。讀者可搜尋已匯入章節、跳轉小節、調整正文字級、標記文字並還原閱讀位置。所有狀態使用獨立的 AMA 本機儲存鍵。

## 驗證與發布

`review.py` 從實際瀏覽器 DOM 回讀全部 46 頁，逐格比對 PDF 來源、點開每一個圖表引用及放大按鈕，並測試 1400、390、320 px 的章節切換、鍵盤操作、搜尋、標記及閱讀位置還原。`--images` 會產生原書在左、重排後網站在右的逐頁比較圖，以及每個圖表的放大圖，須人工檢視。

發布前執行 `node --test` 的既有全站測試，確認 `laws/`、`guides/`、兩個既有轉換器、`index.html` 與遊戲沒有差異。AMA JS/CSS 改動須遞增 `sw.js` 的快取名稱。只提交 AMA 成品、獨立工具與快取版本；不提交來源 PDF、環境或比較影像。

本批詳細紀錄：[c01-c03-review.md](c01-c03-review.md)。
