# AMA 第 9–11 章核對紀錄

來源為使用者提供的完整版 AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf（659 頁）。本批完整閱讀原書 183–279 頁，對應 PDF 第 208–304 頁，共 97 頁；包含正文、案例、表格、註腳與文獻，沒有發現缺頁、截斷或不可讀文字。以下是網站原文轉換紀錄，不是原書內容的校訂。

## 章節清冊與起訖

- Chapter 9 The Hematopoietic System：183–212，共 30 頁。從章名與 Introduction 開始，依序為 9.1 Principles of Assessment（184）、9.2 Anemia（187）、9.3 Myeloproliferative Disorders, including Polycythemia, Myelofibrosis, and Essential Thrombocytosis（191）、9.4 White Blood Cell Diseases or Abnormalities（193）、9.5 Hemorrhagic and Platelet Disorders（201）、9.6 Thrombotic Disorders（206）、9.7 Criteria for Rating Permanent Impairment due to Lymphoma and Metastatic Disease（209）、9.8 Hematologic Impairment Evaluation Summary（210）、References 與 Bibliography（212）。最後為 Goldman/Ausiello, Cecil Textbook of Medicine, 22nd ed., 2004。Table 9-1–9-14 全部匯入。
- Chapter 10 The Endocrine System：213–246，共 34 頁。從章名與 Introduction 開始，依序為 10.1 Principles of Assessment（214）、10.2 Hypothalamic-Pituitary Axis（218）、10.3 Thyroid（222）、10.4 Parathyroids（223）、10.5 Adrenal Cortex（226）、10.6 Adrenal Medulla（230）、10.7 Pancreas (Islets of Langerhans)（232）、10.8 Gonads（237）、10.9 Mammary Glands（239）、10.10 Metabolic Bone Disease（241）、10.11 Endocrine System Impairment Evaluation Summary（244）、Bibliography（246）。最後為 Schwartz/Pertsemlidis/Gagner, Endocrine Surgery, 2004。Table 10-1、10-2A、10-2B、10-3–10-15 共 16 張全部匯入。
- Chapter 11 Ear, Nose, Throat, and Related Structures：247–279，共 33 頁。從章名與 Introduction 開始，依序為 11.1 Principles of Assessment（248）、11.2 Hearing and Tinnitus（248）、11.3 The Face（260）、11.4 The Nose, Throat, and Related Structures（265）、References（277–279，共 37 筆）。最後為 Sataloff et al., Laryngeal Electromyography, 2nd ed., 2006。Table 11-1–11-8 全部匯入。

## 原生表格與轉換器

38 個編號物件全部為可選取、可複製的原生 HTML 表格；跨頁共有 41 個實體頁片段。Table 9-14（210–211）與 Table 10-15（244–245）在放大視窗逐列接成 7 欄；正文仍保留實體頁碼與片段。Table 11-2（252–253）接成 56 欄、55 列，包含原有空白格與底部軸標籤，寬表可橫向捲動。

新增 layout_911.py，只記錄 PDF 幾何範圍、欄列邊界及合併格。build.py 處理白色填色遮住格線的表格、左右續頁合併、表頭分列、字型編碼 ≤/÷，以及帶字母的表號與 SeeTable 引用。所有內容由來源座標擷取，沒有手填 JSON、改算數值或翻譯。

保留裝飾向量的 SVG 路徑與可選取文字，沒有新增圖片、PDF、頁面截圖或 canvas。閱讀版採單欄與瀏覽器字型；換行、空白與線寬適應視窗，並非逐像素複製。文字與數值沒有近似。

## 原書疑點，全部照印刷內容保留

| 原書頁 | 原文或差異 |
|---|---|
| 189 | Table 9-5 的 transfusions or 2 to 3 U，保留 or。 |
| 193 | uric acid 0.54 μmol/L (9.0 mg/dL)。 |
| 197 | Example 9-12：15 × 10⁹/L (150.0 × 10³/μL)；Example 9-13 的 grade C、45%、最終 63% 均照原文。 |
| 198 | Example 9-14：820 g/L (8.2 g/dL)；15.0 × 10⁹/L (15. × 10³/μL)。 |
| 203 | factor VIII or XIX deficiencies，保留 XIX。 |
| 205–206 | 分別為 120 g/L (9.0 g/dL)、125 g/L (9.5 g/dL)。 |
| 223 | 案例藥物每日三次，但原文 BOTC 為 2，未重算。 |
| 225 | 2.63 mmol/L (10.5 mg/mL)；232 ng/L (220 pg/mL)。 |
| 226、243 | 同一延續案例中的副甲狀腺與骨病百分比前後不同，保留各頁數字。 |
| 229 | 18 kg (45 lb)、145 cm (66 in)、86.6 kg (220 lb)，及原文荷爾蒙濃度單位均保留。 |
| 234 | 25.4 kg (25 lb)；Table 10-10 的 0.06–0.08 (6.6%–8%)。 |
| 235 | 0.75 (7.5%)、0.61 (6.1%)；胰島素劑量與截肢描述均未校訂。 |
| 237 | Table 10-11 的 0.06–0.08 (6.6%–8%)。 |
| 241 | 1.2 mIU/L mIU/L，保留重複單位。 |
| 242 | Table 10-14 的 HISTORY 上標為原書字形 0，未改為 b。 |
| 243 | vitamin D 400 mg/d。 |
| 251 | decimal sum，未改寫。 |
| 252–253 | Table 11-2 左右兩頁均沒有 worse-ear 315 列，未補列；左下軸標 ≥100、首列 ≤100，右下軸標 ≥368、末列 ≥370；97.6 與其他不對稱數值均未依公式修正。 |
| 261 | transaction，未改字。 |
| 262、264 | Table 11-5 的 Class 3 為 11%–23%，案例標題為 11% to 20%，各自保留。 |
| 265 | 原書案例編號引用未自行更正。 |

來源頁面齊全。Appendix B、Combined Values Chart 及尚未匯入的第 12–17 章引用保留文字；沒有建立不存在的連結。

## 驗證結果

- 建置：97 頁字元歸屬與 HTML 回讀全部 OK；4,287 個原生儲存格。
- 實際瀏覽器：97 頁、138 個引用、38 個物件；逐格字元順序、rowspan/colspan、完整合併彈窗與深色背景全部 OK，瀏覽器錯誤 0。
- 1400、390、320 px：章節切換、鍵盤、搜尋、標記、閱讀位置還原、既有頁籤與外框寬度全部 OK。
- 人工畫面：97 頁 PDF/網站比較圖與全部 38 張表格放大圖已檢視；聽損矩陣三段橫向截圖、兩張左右續頁總表、兩張數值表表頭及第 251 頁公式另行放大檢查。
- 真實剪貼簿：已匯入 11 章全部正文、表格與 SVG 字標，純文字與 HTML 回讀吻合；原生 Ctrl+C、彈窗與權限拒絕替代流程通過。共 275 個閱讀區塊，對應 277 個原書頁面（沿用先前兩個跨頁區塊）。
- 既有全站 Node 測試：31/31 通過。
- 第 1–8 章重新轉換，8 份 JSON 均與發布前 b663533 的版本逐位元組相同。新增引用規則的 SeeTable 字串在這 8 章不存在。
- 發布差異限 AMA 成品、AMA 獨立工具、此紀錄與 sw.js 快取 v75；沒有修改指引、法規、遊戲、index.html 或 AMA 的操作邏輯。

本機稽核與比較影像位於 .local/ama911/，不隨網站發布。線上部署與真實瀏覽器結果另記於本機發布紀錄。
