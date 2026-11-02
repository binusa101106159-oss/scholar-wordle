# AMA 第 12–14 章核對紀錄

來源為使用者提供的完整版 AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf，共 659 頁。本批從原書 281 頁 The Visual System 讀到 382 頁最後一筆 Ventura et al. 參考文獻；完整讀取 100 頁，包含圖表、案例、註腳、報告表單、BPRS 附錄與文獻。沒有缺頁、截斷或不可讀正文；第 315、317 頁是原書的圖片疊圖，已另外放大檢視。

## 依原書順序的章節清冊

### Chapter 12 The Visual System

原書 281–319，共 39 頁；完整版 PDF 第 306–344 頁。從章名、章節目錄與 Introduction 開始，依序為：

1. 12.1 Principles of Assessment（282）
2. 12.2 Impairment of Visual Acuity（285）
3. 12.3 Impairment of the Visual Field（293）
4. 12.4 Impairment of the Visual System（303）
5. 12.5 Visual Acuity Measurement at Near (Reading Acuity)（309）
6. 12.6 Reporting Aids（312），包含 313 頁報告表、314–315 頁 Goldmann 疊圖及說明、316–317 頁 Humphrey 疊圖及說明
7. References（318–319），含 General Classifications、Visual Disability Ratings、Guides to the Evaluation of Permanent Impairment, Precursors, and Related Publications、Visual Acuity Testing、Testing Methods；最後為 Colenbrander/Lieberman/Schainholz, Perimetry Update 1992/1993, 1993:487–496。

Table 12-1–12-11、Figure 12-1–12-11 全部匯入。

### Chapter 13 The Central and Peripheral Nervous System

原書 321–345，共 25 頁；完整版 PDF 第 346–370 頁。從章名、目錄與 Introduction 開始，依序為：

1. 13.1 Principles of Assessment（322）
2. 13.2 Method for Rating Impairments due to Nervous System Disorders（326）
3. 13.3 Criteria for Rating Cerebral Impairments（326）
4. 13.4 Criteria for Rating Impairment due to Spinal Cord Dysfunction and Movement Disorders（333）
5. 13.5 Criteria for Rating Impairments of Upper Extremities due to CNS Dysfunction（335）
6. 13.6 Criteria for Rating Impairments of Station, Gait, and Movement Disorders（336）
7. 13.7 Criteria for Rating Neurogenic Bowel, Bladder, and Sexual Dysfunction（336）
8. 13.8 Criteria for Rating Neurogenic Respiratory Dysfunction（337）
9. 13.9 Criteria for Rating Peripheral Neuropathy, Neuromuscular Junction Disorders, and Myopathies（339）
10. 13.10 Criteria for Rating Impairments Related to Complex Regional Pain Syndrome（341）
11. 13.11 Criteria for Rating Impairments Related to Craniocephalic Pain（341）
12. 13.12 Criteria for Rating Miscellaneous Peripheral Nerves of the Head and Trunk（343）
13. 13.13 Nervous System Impairment Evaluation Summary（344）
14. References（345），最後為 Stewart et al., MIDAS Questionnaire, Neurology 2001;56:S20–S28。

Table 13-1–13-20 全部匯入。

### Chapter 14 Mental and Behavioral Disorders

原書 347–382，共 36 頁；完整版 PDF 第 372–407 頁。從章名、目錄與 Introduction 開始，依序為：

1. 14.1 Principles of Assessment（348）
2. 14.2 Psychiatric/Psychological Evaluation（349）
3. 14.3 Special Features of the Mental and Behavioral Disorders Independent Medical Examination（351）
4. 14.4 Maximum Medical Improvement（353）
5. 14.5 Concepts for Impairment Ratings（355）
6. 14.6 Method of Impairment Rating（356）
7. 14.7 Examples of Impairment Ratings due to Mental and Behavioral Disorders（360）
8. 14.8 Appendix: Brief Psychiatric Rating Scale (Expanded Version)（369），24 項症狀的定義、1–7 分錨點及原書有提供的訪談問題全部保留
9. References（382），最後為 Ventura et al., Training and quality assurance with the brief psychiatric rating scale: the drift buster, 1993;3:221–244。

Table 14-1–14-17 全部匯入。章首目錄只印到 14.7；14.8 確實在正文末段，未因目錄省略而漏掉。

## 轉換與圖片範圍

48 張編號表格全部為深色原生 HTML；另有 11 個圖／表單，合計 59 個可放大物件。未編號的能力分類表及 BPRS 24 項症狀評分表也建成原生儲存格。BPRS 跨欄與跨頁共 29 個實體片段，保留頁碼與內容順序。

layout_1214.py 只記錄來源位置、欄列與合併格。Table 12-6 的三組表格分開建置；Table 12-11 保留 15 欄（包含原書空白窄欄）、兩層表頭、合併的側邊分級與每格上下數值。Table 12-2 底部跨列數值保留來源相對位置，避免 0／100 被讀成上一行的值。計算表單的數值與空白範圍不補答案。

Figure 12-1–12-9 的圖形用原書 SVG 路徑，字為可選取文字。Figure 12-10（315）與 Figure 12-11（317）的圖形是 PDF 原本的點陣圖，保留為 SVG 內的原始圖片；沒有嵌入 PDF 或頁面截圖。Figure 12-10 無圖內文字，使用原 PDF 的旋轉與非等比例放置矩陣，避免直接使用像素比例造成橢圓；Figure 12-11 的 109 個標籤、355 個非空白字元已人工放大核讀，再以原生 SVG 文字覆在原位置，原圖片字樣移除以免重複。格線與測點仍為原書圖形。這兩張圖的線條因此仍受原始圖片解析度限制。

新增數學字型編碼經放大確認，涵蓋 ±、″、°、| 與另一套 =、+、×。正文保持來源字詞、標點與行末連字號；只做單欄重排。字型、換行、欄寬和圖內文字位置適應瀏覽器，不保證印刷版逐像素一致；沒有近似或重算數值。

## 原書疑點：保留，未校訂

| 原書頁 | 原文差異或疑點 |
|---|---|
| 290、309 | 閱讀視力的章節引用有指向 12.4 的文字，各處照印刷內容保留。 |
| 296 | Table 12-6 的區間印為 12–24°，未改成其他起點。 |
| 297 | Table 12-7 印 Functional Field Score (FSS)，末列為 100 − FAS；未換成 FFS。 |
| 298 | Table 12-8 mild-loss 欄列出 50°、45°、30°、35°，沒有重新排序。 |
| 299 | Example 12-9 先寫 VFS 90，後文寫 82／18%，各自保留。 |
| 301 | Example 12-12 標題為 2%，計算為 1%；上方 Class 0 與 Comment 的 class 1 也保留。 |
| 306 | WPI 換算的 Table 12-8 引用未改號。 |
| 308 | Example 12-15 標題為 16%，內文結果為 20%。 |
| 309 | Example 12-16 在 Class 2 標題下，內文另印 class 3。 |
| 310 | 100 cm 欄的 20/12 等印刷值與 Jaeger 範圍全部原樣保留。 |
| 314 | beyond 600，保留印出的 600，未推定為 60°。 |
| 317 | Humphrey 30-2 左圖第三排為 3x、8x、8x、3x，右圖第三排為 3x、6x、6x、3x；保留左右差異。 |
| 339 | T10 complete paraplegia 案例的結尾印 quadriplegia；Step 3 的 continent／occasional incontinence 敘述也保留。 |
| 341 | 對泌尿、肛直腸及性功能的 Table 13-15 引用未自行改號。 |
| 357 | Table 14-8 註腳寫 items 5 to 24，正文及附錄寫 15 to 24，兩者都保留。 |
| 362 | BPRS 39 先列 10%，Step 4 列 15%；PIRS 原列分數與排序後的 3,3,3,3,4,5 不一致，未改算。 |
| 363 | BPRS 43 在案例列 20%，保留與 Table 14-9 對照不同的原文。 |
| 364 | BPRS 31 在案例列 10%，原樣保留。 |
| 366 | BPRS 36 在案例列 15%，原樣保留。 |
| 368 | PRIS 拼字保留，未統一為 PIRS。 |

沒有補入來源未提供的內容。尚未匯入的第 15–17 章、Appendix B 與 Combined Values Chart 保留未連結文字。原文提到 Figure 12-5A／12-5B，但本章只有一個合成的 Figure 12-5；未捏造兩個獨立物件。

## 核對與保護既有內容

- 100 頁、1,866 個儲存格的來源字元歸屬與 HTML 回讀全部通過；頁碼涵蓋 281–319、321–345、347–382。
- 全部表格逐格核對字元順序、rowspan／colspan；303 個引用或放大按鈕、59 個物件均在瀏覽器開啟核對。修正後章節另重跑，詳細結果見本機 .local/ama1214/。
- 1400、390、320 px 的章節、鍵盤、搜尋、標記、閱讀位置還原與既有分頁檢查通過；瀏覽器錯誤 0。
- 100 頁來源／網站比較圖與全部編號表格已人工檢視；視野圖、閱讀視力表、計算表單、BPRS 憂鬱表及跨欄續表另放大核對。
- 全部 14 章真實剪貼簿測試：純文字、HTML、表格合併格、SVG 字標、原生 Ctrl+C、彈窗及權限拒絕替代流程。網站合計 377 個原書頁面，375 個閱讀區塊。
- 既有全站測試 31/31 通過。
- 第 1–11 章用各批發布當時的引用清冊重新建置，11 份 JSON 與發布前 1aa9249 逐位元組相同。若一次用第 11 章以後的清冊重建全部舊章，第 8 章會自然多出 3 個 Table 11-5 連結；為保持本批範圍，沒有把這些變化寫入成品。
- Git 差異限制為 AMA 成品、AMA 工具、此報告與快取 v76；指引、法規、遊戲、index.html、AMA JS 及既有 11 章 JSON 均不變。

圖片與完整稽核只放本機 .local/ama1214/；不發布來源 PDF、比較圖或環境。線上部署檔案一致性與最終真實瀏覽器結果另存本機發布紀錄。
