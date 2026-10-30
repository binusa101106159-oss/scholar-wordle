"""附表 that exist only as pictures in the PDF, transcribed by hand from the image (checked at 200-300 dpi)."""
import json, os
from catalog import SRC

FREQ = ['1.0', '1.25', '1.6', '2.0', '2.5', '3.15', '4.0', '5.0', '6.3', '8.0', '10.0', '12.5', '16.0', '20.0', '25.0', '31.5', '40.0', '50.0', '62.0', '80.0']
TIMES = ['8 小時', '4 小時', '2.5 小時', '1 小時', '25 分', '16 分', '1 分']

T1 = """1.26 2.12 2.80 4.72 7.10 8.50 11.20
1.12 1.90 2.52 4.24 6.30 7.50 10.00
1.00 1.70 2.24 3.80 5.60 6.70 9.00
0.90 1.50 2.00 3.40 5.00 6.00 8.00
0.80 1.34 1.80 3.00 4.48 5.28 7.10
0.710 1.20 1.60 2.64 4.00 4.70 6.30
0.630 1.06 1.42 2.36 3.60 4.24 5.60
0.630 1.06 1.42 2.36 3.60 4.24 5.60
0.630 1.06 1.42 2.36 3.60 4.24 5.60
0.630 1.06 1.42 2.36 3.60 4.24 5.60
0.80 1.34 1.80 3.00 4.48 5.30 7.10
1.00 1.70 2.24 3.80 5.60 6.70 9.00
1.26 2.12 2.80 4.72 7.10 8.50 11.20
1.60 2.64 3.60 6.00 9.00 10.60 14.20
2.00 3.40 4.48 7.50 11.20 13.40 18.00
2.50 4.24 5.60 9.50 14.20 17.00 22.4
3.20 5.30 7.10 12.00 18.00 21.2 28.0
4.00 6.70 9.00 15.00 22.4 26.4 36.0
5.00 8.50 11.20 19.00 28.0 34.0 44.8
6.30 10.60 14.20 22.16 36.0 42.4 54.0"""

T2 = """0.448 0.710 1.00 1.70 2.50 3.00 4.0
0.448 0.710 1.00 1.70 2.50 3.00 4.0
0.448 0.710 1.00 1.70 2.50 3.00 4.0
0.448 0.710 1.00 1.70 2.50 3.00 4.0
0.560 0.900 1.26 2.12 3.2 3.8 2.0
0.710 1.120 1.6 2.64 4.0 4.72 6.30
0.900 1.420 2.0 3.40 5.0 6.0 8.0
1.120 1.800 2.50 4.24 6.30 7.50 10.0
1.420 2.24 3.2 5.2 8.0 9.50 12.6
1.800 2.80 4.0 6.70 10.0 12.0 16.6
2.24 3.60 5.0 8.50 12.6 15.0 20
2.80 4.48 6.30 10.60 16.0 19.0 25.0
3.60 5.60 8.0 13.40 20 23.6 32
4.48 7.10 10.0 17.0 25.0 30 40
5.60 9.00 12.6 21.2 32 38 50
7.10 11.20 16.0 26.4 40 47.2 63.0
9.00 14.20 20.0 34.0 50 60 80
11.20 18.0 25.0 42.4 63.0 75 100
14.20 22.4 32.0 53.0 80 91.4 126
18.00 28.0 40 67.0 100 120 160"""


def vib(aid, title, body):
    vals = [l.split() for l in body.strip().split('\n')]
    assert len(vals) == len(FREQ) and all(len(v) == 7 for v in vals), aid
    head = [dict(rs=1, cs=1, text='', diag=dict(tr='容\n許\n時\n間', mid='加速度\nm／s²', bl='1/3 八\n音度頻帶\n中心頻率 Hz'))] + \
           [dict(rs=1, cs=1, text=t) for t in TIMES]
    rows = [head] + [[dict(rs=1, cs=1, text=f)] + [dict(rs=1, cs=1, text=v) for v in row] for f, row in zip(FREQ, vals)]
    return dict(id=aid, law='s07', label=aid[-1] == '1' and '表一' or '表二', title=title,
                blocks=[dict(t='p', text=('表一：' if aid.endswith('1') else '表二：') + title, center=True),
                        dict(t='table', rows=rows, widths=[94, 38, 38, 38, 38, 38, 38, 38], head=1)])


def write(outdir):
    for aid, title, body in [('s07-1', '垂直方向全身振動暴露最大加速度值m／s2', T1), ('s07-2', '水平方向全身振動暴露最大加速度值m／s2', T2)]:
        json.dump(vib(aid, title, body), open(os.path.join(outdir, aid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('manual', aid)





def heat_index(outdir):
    """表三 熱指數表: values from the PDF text; each cell's level from its printed shading."""
    import pdfplumber, pymupdf, glob, statistics, collections, re
    f = glob.glob(os.path.join(SRC, '職業安全衛生設施規則 表三*'))[0]
    p = pdfplumber.open(f).pages[0]
    words = p.extract_words()
    nums = [w for w in words if w['text'].replace('.', '').isdigit()]
    RH = [str(x) for x in range(40, 101, 5)]
    rh = sorted([w for w in nums if w['top'] > 595 and w['text'] in RH], key=lambda w: w['x0'])
    temps = sorted([w for w in nums if w['x0'] < 140 and '.' in w['text']], key=lambda w: w['top'])
    assert [w['text'] for w in rh] == RH and len(temps) == 16, (len(rh), len(temps))
    pix = pymupdf.open(f)[0].get_pixmap(dpi=144, colorspace=pymupdf.csGRAY); k = 2

    def shade(x, y):
        return statistics.median(pix.samples[int(y * k + dy) * pix.stride + int(x * k + dx)] for dx in (-2, -1, 0, 1, 2) for dy in (-2, -1, 0, 1, 2))
    level = lambda g: 4 if g < 204 else 3 if g < 229 else 2 if g < 248 else 1
    vals = {}
    for w in nums:
        if w['x0'] < 160 or w['top'] > 595: continue
        t = min(temps, key=lambda t: abs(t['top'] - w['top']))
        r = min(rh, key=lambda r: abs((r['x0'] + r['x1']) / 2 - (w['x0'] + w['x1']) / 2))
        vals[(t['text'], r['text'])] = w['text']
    bands = [('第\n四\n級', 2), ('第\n三\n級', 5), ('第\n二\n級', 4), ('第\n一\n級', 5)]
    starts, k0 = {}, 0
    for lab, n in bands: starts[k0] = (lab, n); k0 += n
    rows = []
    for i, t in enumerate(temps):
        row = []
        if i == 0: row.append(dict(rs=16, cs=1, c=0, text='溫\n度\n(°C)'))
        row.append(dict(rs=1, cs=1, c=1, text=t['text']))
        if i in starts:
            lab, n = starts[i]; row.append(dict(rs=n, cs=1, c=2, text=lab, lv={0: 4, 2: 3, 7: 2, 11: 1}[i]))
        for j, r in enumerate(rh):
            g = shade((r['x0'] + r['x1']) / 2, t['top'] - 6)
            row.append(dict(rs=1, cs=1, c=3 + j, text=vals.get((t['text'], r['text']), ''), lv=level(g)))
        rows.append(row)
    rows.append([dict(rs=2, cs=3, c=0, text='', lv=0)] + [dict(rs=1, cs=1, c=3 + j, text=x) for j, x in enumerate(RH)])
    rows.append([dict(rs=1, cs=13, c=3, text='相對濕度(%)')])
    # check: every character printed in the table is here, nothing extra
    src = collections.Counter(re.sub(r'\s', '', ''.join(c['text'] for c in p.chars)).replace('：', '').replace('表三熱指數表', '', 1).replace('o', '°'))  # superscript o prints as °
    ours = collections.Counter(re.sub(r'\s', '', ''.join(c['text'] for r in rows for c in r)))
    print('heat-index check:', 'OK' if src == ours else (dict(src - ours), dict(ours - src)))
    data = dict(id='s07-3', law='s07', label='表三', title='熱指數表',
                blocks=[dict(t='p', text='表三：熱指數表', center=True),
                        dict(t='table', rows=rows, widths=[22, 26, 26] + [25.8] * 13, head=0, levels=True)])
    json.dump(data, open(os.path.join(outdir, 's07-3.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    import sys
    write(sys.argv[1])
    heat_index(sys.argv[1])
