"""Tables that a PDF prints only as a picture, transcribed by eye from that picture (no text layer to read).

Keyed by (guide id, PDF page number): build.py puts the table where the picture stood, and the QC counts the
transcribed characters as read (like IMAGE_LABELS). Every value below was read off the PDF's own embedded image;
nothing is computed or taken from another document. `lv` is the printed shading (1 = white … 4 = darkest), shown
with the same heat colours as the 法規 tab.

farm-p03 (日射病（中暑）熱痙攣熱衰竭等疾病之認定參考指引):
  PDF p.11 表二 熱指數表 — embedded image 1255×1390 px, read row by row at full size; the 208 values, the four
  level bands and the staircase of shading also agree cell for cell with 職業安全衛生設施規則 表三 (laws/annex/s07-3).
  PDF p.12 表三 熱危害風險等級 — embedded image 721×416 px, read at 2×. The 低→高 arrow is a drawing in the
  picture; it is written as 低 ↓ 高.

farm-b01 (日本腦炎職業病認定參考指引): PDF p.6 hazard-ratio table (no caption), see je_hazard_ratios().
"""

TEMPS = ['43.3', '42.2', '41.1', '40.0', '38.9', '37.8', '36.7', '35.6', '34.4', '33.3', '32.2', '31.1', '30.0', '28.9', '27.8', '26.7']
RH = ['40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100']
# one line per temperature: the printed values from 40 % to 100 % relative humidity ('' = empty cell)
HEAT = [
    ['57.8', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['54.4', '58.3', '', '', '', '', '', '', '', '', '', '', ''],
    ['51.1', '54.4', '58.3', '', '', '', '', '', '', '', '', '', ''],
    ['48.3', '51.1', '55.0', '58.3', '', '', '', '', '', '', '', '', ''],
    ['45.6', '48.3', '51.1', '54.4', '58.3', '', '', '', '', '', '', '', ''],
    ['42.8', '45.6', '47.8', '51.1', '53.9', '57.8', '', '', '', '', '', '', ''],
    ['40.6', '42.8', '45.0', '47.2', '50.6', '53.3', '56.7', '', '', '', '', '', ''],
    ['38.3', '40.0', '42.2', '44.4', '46.7', '49.4', '52.2', '55.6', '58.9', '', '', '', ''],
    ['36.1', '37.8', '39.4', '41.1', '43.3', '45.6', '48.3', '51.1', '53.9', '57.2', '', '', ''],
    ['34.4', '35.6', '37.2', '38.3', '40.6', '42.2', '44.4', '46.7', '49.4', '52.2', '55.0', '58.3', ''],
    ['32.8', '33.9', '35.0', '36.1', '37.8', '39.4', '40.6', '42.8', '45.0', '47.2', '50.0', '52.8', '55.6'],
    ['31.1', '31.7', '32.8', '33.9', '35.0', '36.7', '37.8', '39.4', '41.1', '43.3', '45.0', '47.2', '49.4'],
    ['29.4', '30.6', '31.1', '31.7', '32.8', '33.9', '35.0', '36.1', '37.8', '38.9', '40.6', '42.2', '44.4'],
    ['28.3', '28.9', '29.4', '30.0', '31.1', '31.7', '32.2', '33.3', '34.4', '35.6', '36.7', '37.8', '39.4'],
    ['27.2', '27.8', '28.3', '28.9', '28.9', '29.4', '30.0', '31.1', '31.7', '32.2', '32.8', '33.9', '35.0'],
    ['26.7', '26.7', '27.2', '27.2', '27.8', '27.8', '28.3', '28.9', '28.9', '29.4', '30.0', '30.0', '30.6'],
]
# the printed shading of every value cell, same layout (4 = darkest band … 1 = white)
SHADE = [
    '4444444444444',
    '4444444444444',
    '3444444444444',
    '3344444444444',
    '3334444444444',
    '3333344444444',
    '3333334444444',
    '2233333444444',
    '2223333334444',
    '2222333333444',
    '2222223333334',
    '1122222233333',
    '1111222222333',
    '1111112222222',
    '1111111112222',
    '1111111111111',
]
# level label cells on the left: (first row, rows spanned, text, shading)
BANDS = [(0, 2, '第\n四\n級', 4), (2, 5, '第\n三\n級', 3), (7, 4, '第\n二\n級', 2), (11, 5, '第\n一\n級', 1)]


def heat_index():
    rows = []
    starts = {b[0]: b for b in BANDS}
    for i, t in enumerate(TEMPS):
        row = []
        if i == 0: row.append(dict(rs=16, cs=1, c=0, text='溫\n度\n(°C)'))
        row.append(dict(rs=1, cs=1, c=1, text=t))
        if i in starts:
            _, n, lab, lv = starts[i]
            row.append(dict(rs=n, cs=1, c=2, text=lab, lv=lv))
        for j, v in enumerate(HEAT[i]):
            row.append(dict(rs=1, cs=1, c=3 + j, text=v, lv=int(SHADE[i][j])))
        rows.append(row)
    rows.append([dict(rs=2, cs=3, c=0, text='', lv=0)] + [dict(rs=1, cs=1, c=3 + j, text=x) for j, x in enumerate(RH)])
    rows.append([dict(rs=1, cs=13, c=3, text='相對濕度(%)')])
    return dict(t='table', rows=rows, widths=[22, 26, 26] + [25.8] * 13, head=0)


def risk_levels():
    head = [dict(rs=1, cs=2, c=0, text='熱危害風險等級'), dict(rs=1, cs=1, c=2, text='熱指數值'), dict(rs=1, cs=1, c=3, text='風險管理原則')]
    body = [
        [dict(rs=4, cs=1, c=0, text='低\n↓\n高'), dict(rs=1, cs=1, c=1, text='第一級', lv=1), dict(rs=1, cs=1, c=2, text='26.7 以上，\n未達 32.2'),
         dict(rs=1, cs=1, c=3, text='為熱暴露之基本防護與原則，對於從事重體力作業時應提高警覺，依附表三採取必要防護措施。')],
        [dict(rs=1, cs=1, c=1, text='第二級', lv=2), dict(rs=1, cs=1, c=2, text='32.2 以上，\n未達 40.6'),
         dict(rs=1, cs=1, c=3, text='實施危害預防措施及提升危害認知，依附表三對應級別採取相關防護措施。')],
        [dict(rs=1, cs=1, c=1, text='第三級', lv=3), dict(rs=1, cs=1, c=2, text='40.6 以上，\n未達 54.4'),
         dict(rs=1, cs=1, c=3, text='強化採取之危害預防及管理措施：\n▪ 避免使勞工於高溫時段從事戶外作業。\n▪ 應採取附表三對應級別所列之相關措施，並注意勞工身體狀況。')],
        [dict(rs=1, cs=1, c=1, text='第四級', lv=4), dict(rs=1, cs=1, c=2, text='54.4 以上'),
         dict(rs=1, cs=1, c=3, text='更積極執行相關防護措施：\n▪ 應避免使勞工從事戶外作業。\n▪ 如有使勞工從事戶外作業之必要時，應確實採取附表三對應級別所列之相關措施，並加強緊急應變機制。')],
    ]
    return dict(t='table', rows=[head] + body, widths=[38, 52, 62, 210], head=1)


def je_hazard_ratios():
    """farm-b01 PDF p.6: the hazard-ratio table that the PDF embeds as a picture (1388×741 px, read at 1.5×), with
    the slide's own label 日本腦炎 ( 062.0、A83.0) on its left; printed as is, including 9.72(6.51-14.50.)."""
    I = '\u3000'                       # the picture indents the levels under each variable
    data = [
        ('暴露分組',), (I + '非農保', 'Ref.', '', 'Ref.', ''), (I + '農保', '1.47(1.07-2.01)', '0.018*', '2.05(1.38-3.04)', '<0.001***'),
        ('性別',), (I + '男', 'Ref.', '', 'Ref.', ''), (I + '女', '0.69(0.58-0.83)', '<0.001***', '0.84(0.70-1.02)', '0.079'),
        ('年齡(unit=1)', '1.01(1.00-1.01)', '0.015*', '0.97(0.97-0.98)', '<0.001***'),
        ('暴露年資(unit=1)', '0.94(0.93-0.96)', '<0.001***', '1.04(1.01-1.07)', '0.019*'),
        ('死亡',), (I + '無', 'Ref.', '', 'Ref.', ''), (I + '有', '4.78(3.89-5.89)', '<0.001***', '3.92(2.84-5.43)', '<0.001***'),
        ('戶籍地',), (I + '北', 'Ref.', '', 'Ref.', ''),
        (I + '中', '1.92(1.46-2.51)', '<0.001***', '1.63(1.24-2.14)', '0.001**'),
        (I + '南', '2.45(1.93-3.09)', '<0.001***', '2.02(1.59-2.57)', '<0.001***'),
        (I + '東', '6.45(4.50-9.24)', '<0.001***', '4.76(3.30-6.87)', '<0.001***'),
        (I + '離島或其他', '0.69(0.17-2.78)', '0.599', '0.66(0.16-2.66)', '0.556'),
        (I + '未知', '0.83(0.59-1.17)', '0.286', '0.10(0.06-0.15)', '<0.001***'),
        ('社會經濟地位¹',), (I + '低', 'Ref.', '', 'Ref.', ''),
        (I + '中下', '9.25(7.04-12.16)', '<0.001***', '9.72(6.51-14.50.)', '<0.001***'),
        (I + '中上', '0.62(0.48-0.80)', '<0.001***', '0.51(0.39-0.67)', '<0.001***'),
        (I + '高', '0.58(0.44-0.75)', '<0.001***', '0.56(0.42-0.75)', '<0.001***'),
        (I + '未知', '0.41(0.29-0.58)', '<0.001***', '7.67(4.89-12.02)', '<0.001***'),
    ]
    rows = [[dict(rs=1, cs=5, c=0, text='日本腦炎\n( 062.0、A83.0)')],
            [dict(rs=1, cs=1, c=k, text=t) for k, t in enumerate(['變項', 'cHR(95% CI)', 'p-value', 'aHR(95% CI)', 'p-value'])]]
    for r in data:
        rows.append([dict(rs=1, cs=5, c=0, text=r[0])] if len(r) == 1 else [dict(rs=1, cs=1, c=k, text=t) for k, t in enumerate(r)])
    return dict(t='table', rows=rows, widths=[78, 92, 62, 96, 62], head=2)


MANUAL_TABLES = {
    ('farm-b01', 6): je_hazard_ratios,
    ('farm-p03', 11): heat_index,
    ('farm-p03', 12): risk_levels,
}


def table_text(tb):
    return ''.join(c['text'] for r in tb['rows'] for c in r)
