# AMA 第 1–3 章核對紀錄

來源：使用者提供的完整版 *AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf*。共 659 個 PDF 頁，本批使用 PDF 第 26–71 頁，即原書第 1–46 頁。正文、表格、圖說、註腳、附錄與參考文獻均納入；起於原書第 1 頁章名，終於第 46 頁第 27 筆參考文獻。無缺頁或不可讀正文。

來源 SHA-256：`3967c86f1f5cad350d8ae8abf09855c89bb282b4fb6fa9e1dff4b8d76a65f9cc`。

## 範圍

| 章 | 原書頁碼 | 編號表 | 編號圖 | 附錄 |
|---|---|---|---|---|
| 1 Conceptual Foundations and Philosophy | 1–18 | Table 1-1～1-6 | Figure 1-1、1-2 | — |
| 2 Practical Application of the Guides | 19–30 | Table 2-1 | Figure 2-1～2-3 | — |
| 3 Pain-Related Impairment | 31–46 | Table 3-1 | Figure 3-1 | Appendix 3-1～3-3 |

全部 17 章依原書順序保留在同一 AMA 選單，網站不顯示工作批次。第 4–17 章仍顯示正文準備中。

## 檢查結果

- 46/46 頁來源文字、HTML 回讀及實際瀏覽器 DOM 的字元覆蓋與頻次一致；合計 155,091 個非空白字元，每個來源字元只歸屬一個物件。
- 219/219 個原生表格儲存格的字元順序、跨列與跨欄符合 PDF 座標來源；含空白格、Table 1-5 三段表格、Figure 2-3 六欄報告表、PDQ 15 題及每題 0–10 刻度。
- 17/17 個編號圖表／附錄可開啟；逐一操作全部 45 個入口（28 處文字引用與 17 個放大按鈕），包含跨章引用。
- 1400、390、320 px：17 章切換、鍵盤選單、章內跳轉、全文搜尋、標記還原、字級與閱讀位置還原均通過；沒有頁面水平溢出，瀏覽器錯誤 0。
- 既有 Node 測試 18/18 通過；法規、指引及三個遊戲入口操作正常。
- 逐頁比較圖及所有圖表放大圖置於忽略追蹤的 `.local/ama-part1/review/`，人工檢視原書與重排後網站。

## 保留、差異與待匯入引用

- 正文、數值、標點與原書行末連字號均保留；沒有人工補寫或近似的數值。
- 原書第 6 頁的 `martial`、第 24 頁的 `impuning` 保持原字，不改成其他拼字。
- 原書第 40 頁正文寫 4 類，mild 為 0–70；同頁 Table 3-1 另列 None=0，Mild=1–70，且 Appendix 3-2（第 44 頁）寫 5 類。三處分別保留，不自行統一。
- Appendix B 的引用出現在第 12、13、23 頁；Combined Values Chart 出現在第 22、23、26 頁。來源完整版含這些資料，但本批尚未匯入，保留原文並暫不連結；沒有以其他資料補缺。
- Figure 1-1、1-2、2-1、2-2、3-1 及 Table 1-5 的裝飾圖形保留原向量路徑，圖中文字仍可選取；沒有點陣圖、整頁截圖或 PDF 嵌入網站。Figure 2-3 與 PDQ 均為原生 HTML。
- 書名頁眉、跑馬頁碼與書邊章標改由閱讀器的原書頁碼取代；三張章首裝飾線使用 HTML 水平線，省略重複淡色章首徽記。採瀏覽器字型、單欄重排及原生填寫空白區，並非印刷頁的逐像素複製。

## 轉換器與保護範圍

新增獨立 `tools/ama-build/`，處理 PDF 裁切座標、逐字歸屬、MathematicalPi 字型編碼（+、=）、原生合併表格、填色表頭、表單欄位、向量中的零面積線段與跨物件複合路徑裁切。沒有修改法規或指引的轉換器。AMA 專用樣式保留粗體與斜體，未更改全站樣式。

既有成品與發布前 main 基準 `aa9c53dfcb36649605bc14293da41dadfedf8622` 比對，以下路徑沒有任何差異：

| 路徑 | 前後相同 Git 物件 |
|---|---|
| `laws` | `e359ddcc33b8699a9e5802e5a6c88ea68d29a64c` |
| `guides` | `2c50a905e1e6df81a772cb21509ceab7943b7a97` |
| `tools/laws-build` | `6a1ba67cfadbf1528cae825cbe89a1533b205d12` |
| `tools/guides-build` | `eb0058c71ba1af4f0b5aa70fe870939502be9857` |
| `index.html` | `3220fb35148d7ab3b183bdea253f2df6e608f712` |

因此法規 S／B／C／A 全部既有成品、Claude 管理的指引、主頁及遊戲程式維持原樣。共享檔案只遞增 `sw.js` 快取版本；其餘改動限於 AMA 及其獨立工具。

## 原書標題清單

依各頁實際閱讀順序列出轉換器辨識的章名、主節與小節，並保留原書頁碼：

### Chapter 1 — Conceptual Foundations and Philosophy

- 第 1 頁：C H A P T E R 1
- 第 1 頁：Conceptual Foundationsand Philosophy
- 第 1 頁：1.1 History of the Guides
- 第 2 頁：1.2 New Directions for the Sixth Edition
- 第 2 頁：1.2a Previous Criticisms of the Guides
- 第 2 頁：1.2b Five New Axioms of theSixth Edition
- 第 3 頁：1.3 The International Classification of Functioning, Disability, and Health (ICF): A Contemporary Model of Disablement
- 第 3 頁：1.3a ICF Model
- 第 3 頁：impairments.
- 第 3 頁：disorder, or disease, and to environmental factors
- 第 3 頁：1.3b Applications of ICF Model to the Guides
- 第 3 頁：Advantages of ICF Model
- 第 4 頁：History of Models of Disablement
- 第 4 頁：Interim Developments of the WHO and Institute of Medicine
- 第 5 頁：International Appeal and Applications
- 第 5 頁：1.3c ICF Terminology and Definitions
- 第 5 頁：1.3d Operational Definitions: Impairment, Disability, Handicap
- 第 6 頁：1.3e Domains of Personal Function
- 第 6 頁：Mobility
- 第 6 頁：Self-Care
- 第 6 頁：Instrumental Activities of Daily Living (IADLs):
- 第 6 頁：Examples of Impairment and Disability
- 第 6 頁：1.4 Measurement Issues
- 第 7 頁：Measurement Scales
- 第 8 頁：Precision and Accuracy
- 第 8 頁：1.5 Balancing Science and Clinical Judgment
- 第 8 頁：1.5a The Relative Merits of Study Designs
- 第 9 頁：Reliability
- 第 9 頁：Validity
- 第 9 頁：1.6 The Case for Simplification and Ease of Application
- 第 9 頁：1.7 The Application of Functional Assessment
- 第 9 頁：1.7a Earlier Approaches ThatHave Worked Well
- 第 10 頁：1.7b Self-Report Assessment Tools and the Need for Empirical Validation Through In-Office Applications
- 第 10 頁：1.7c Choice of Functional Assessment Tools
- 第 11 頁：1.8 The Need for Internal Consistency and a Uniform Template
- 第 11 頁：1.8a ICF Scale of Capacity and Performance Qualifiers (Levels 0–4)
- 第 12 頁：1.8b Basic Components of the Template
- 第 12 頁：1.8c Generic Template for Uniformity and Ease of Application
- 第 14 頁：1.8d General Principles and Rules for Calculating Impairment
- 第 15 頁：1.8e History of Clinical Presentation
- 第 15 頁：1.8f Physical Findings
- 第 15 頁：1.8g Objective Test Results
- 第 15 頁：1.8h Functional Assessment
- 第 15 頁：1.8i Determining the Burden of Treatment Compliance
- 第 16 頁：1.9 Summary
- 第 16 頁：References

### Chapter 2 — Practical Application of the Guides

- 第 19 頁：C H A P T E R 2
- 第 19 頁：Practical Applicationof the Guides
- 第 19 頁：Introduction
- 第 20 頁：2.1 Use of the Guides in Workers’ Compensation and Other Disability Systems
- 第 20 頁：2.1a Workers’ Compensation
- 第 21 頁：2.1b Federal Systems
- 第 21 頁：2.1c International Use of the Guides
- 第 21 頁：2.1d Automobile and Personal Injury Claims
- 第 21 頁：2.2 Organ System and Whole Body Approach to Impairment Ratings
- 第 21 頁：2.2a Regional vs Whole Person Impairments
- 第 21 頁：2.2b Hierarchy in Whole Person Concept
- 第 22 頁：2.2c The Combined Values Chart
- 第 23 頁：2.2d Combining Impairments in and Between Organ Systems
- 第 23 頁：2.3 Use of the Guides
- 第 23 頁：2.3a Who Performs Impairment Ratings?
- 第 23 頁：2.3b Examiner’s Roles and Responsibilities
- 第 24 頁：2.3c When Are Impairment Ratings Performed?
- 第 24 頁：2.4 Rules of Applicationfor the Guides
- 第 24 頁：2.4a Confidentiality
- 第 24 頁：2.4b Consistency
- 第 24 頁：2.4c Interpolating and Rounding Off
- 第 25 頁：2.4d Pain and Suffering
- 第 25 頁：2.4e Using Assistive Devices in Evaluations
- 第 25 頁：2.5 Concepts Important to the Independent Medical Examiner
- 第 25 頁：2.5a Legal vs Medical Possibility and Probability
- 第 25 頁：2.5b Causality, Exacerbation, and Aggravation
- 第 25 頁：2.5c Apportionment
- 第 26 頁：2.5d Changes in ImpairmentFrom Prior Ratings
- 第 26 頁：2.5e Maximum Medical Improvement
- 第 26 頁：2.5f Permanency
- 第 27 頁：2.5g Cultural Differences
- 第 27 頁：2.6 Impairment Evaluation and the Law
- 第 27 頁：Cultural Differences Examples
- 第 28 頁：2.7 Preparing Reports
- 第 28 頁：2.7a Clinical Evaluation
- 第 28 頁：2.7b Analysis of the Findings
- 第 28 頁：2.7c Discussion of How the Impairment Rating Was Calculated
- 第 29 頁：Standards of Legal Admissibility
- 第 29 頁：References

### Chapter 3 — Pain-Related Impairment

- 第 31 頁：C H A P T E R 3
- 第 31 頁：Pain-Related Impairment
- 第 31 頁：Introduction
- 第 32 頁：3.1 Definition and Classification of Pain
- 第 32 頁：3.1a Definition of Pain
- 第 32 頁：3.1b Chronic Pain Syndrome
- 第 33 頁：3.1c Nociceptive Pain
- 第 34 頁：3.1d Neuropathic Pain
- 第 34 頁：3.1e Persistent Pain as a Disease Entity
- 第 35 頁：3.2 Controversies Surrounding Pain-Related Impairment
- 第 35 頁：3.2a Practical Problems With Rating Pain-Related Impairment
- 第 35 頁：Subjectivity of Pain
- 第 35 頁：Level of Analysis: Body Parts vs Whole Person
- 第 35 頁：Pain as Isolated Problem vsComponent of Medical Conditions
- 第 36 頁：Resolution of Conceptual Conundrums
- 第 36 頁：3.2b Fundamental Concepts in Determining Pain-Related Impairment
- 第 36 頁：Specious Issues
- 第 37 頁：Crucial Issues
- 第 37 頁：How Much Weight Should Be Given to Pain in Impairment Ratings?
- 第 37 頁：3.3 The Rating System
- 第 37 頁：3.3a The Problem of Credibility and Consistency in Rating Pain-Related Impairment
- 第 38 頁：Congruence With Established Conditions
- 第 38 頁：Consistency Over Time and Situation
- 第 38 頁：Consistency With Anatomy and Physiology
- 第 39 頁：Interobserver Agreement
- 第 39 頁：Inappropriate Illness Behavior
- 第 39 頁：3.3b Rating Impairment When Pain Accompanies Objective Findings of Injury or Illness That Permit Rating Using Another Chapter in the Guides
- 第 39 頁：3.3c Rating Impairment When Pain Is Not Accompanied by Objective Findings
- 第 40 頁：3.3d Steps of Assessment
- 第 40 頁：3.4 Future Directions—Need for Research and Dialogue to Establish the Validity of Rating Pain-Related Impairment
- 第 41 頁：3.5 Conclusion
- 第 41 頁：3.6 Examples
- 第 43 頁：3.7 Appendixes
- 第 46 頁：References
- 第 43 頁：Appendix 3-1
- 第 44 頁：Appendix 3-2
- 第 45 頁：Appendix 3-3
