"""Extract AAOS definitions and constants, never the workbook's record data."""
import hashlib, json, sys, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

src = Path(sys.argv[1])
root = Path(__file__).resolve().parents[2]
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(src) as z:
    strings = [''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', ns):
        target = rels[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
        path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        cells = {}
        for c in ET.fromstring(z.read(path)).findall('.//m:c', ns):
            v = c.find('m:v', ns)
            if v is not None and v.text is not None:
                cells[c.get('r')] = strings[int(v.text)] if c.get('t') == 's' else v.text
        sheets[sheet.get('name')] = cells

entry, instructions, scores = (sheets[t] for t in ['Data Entry', 'Instructions', 'Standardized & Normative Scores'])
labels = ['下肢僵硬程度', '下肢腫脹程度', '平地行走時的疼痛', '上下樓梯時的疼痛', '夜間躺床時的疼痛', '大部分時間的移動方式', '穿脫襪子的困難程度']
translations = [
    ['完全沒有', '輕微', '中等', '很嚴重', '極嚴重'],
    ['完全沒有', '輕微', '中等', '很嚴重', '極嚴重'],
    ['不痛', '輕微疼痛', '中等疼痛', '很痛', '極度疼痛', '因疼痛而無法進行', '因其他原因而無法進行'],
    ['不痛', '輕微疼痛', '中等疼痛', '很痛', '極度疼痛', '因疼痛而無法進行', '因其他原因而無法進行'],
    ['不痛', '輕微疼痛', '中等疼痛', '很痛', '極度疼痛', '因疼痛而無法進行', '因其他原因而無法進行'],
    ['不需支撐', '大多不需支撐即可行走', '大多使用1支手杖／拐杖', '大多使用2支手杖／拐杖', '使用輪椅', '大多使用其他支撐／他人協助', '無法移動'],
    ['完全沒有困難', '有一點困難', '中等困難', '很困難', '極度困難', '完全無法做到'],
]
questions = []
for i, col in enumerate('BCDEFGH'):
    # D3:F9 are merged in the source; D is the shared option master for Q3-Q5.
    option_col = 'D' if i in (2, 3, 4) else col
    options = []
    for code, zh in enumerate(translations[i], 1):
        original = entry[f'{option_col}{code + 2}']
        assert original.startswith(str(code) + '=')
        options.append({'value': code, 'label': zh, 'original': original.split('=', 1)[1], 'sourceCell': f'{option_col}{code + 2}'})
    questions.append({'id': f'q{i+1}', 'label': labels[i], 'original': entry[f'{col}2'], 'sourceCell': f'{col}2', 'max': len(options), 'missingCode': 7 if i in (2, 3, 4) else None, 'factor': 1.25 if i in (0, 1) else 5/6 if i == 5 else 1, 'options': options})
severity = []
for row, label in zip(range(51, 56), ['正常', '輕度缺損', '中度缺損', '重度缺損', '近全至完全缺損']):
    value = instructions[f'A{row}']
    low, high = map(int, value.split('-')) if '-' in value else (int(float(value)), int(float(value)))
    severity.append({'min': low, 'max': high, 'label': label, 'original': instructions[f'B{row}'], 'sourceRange': f'Instructions!A{row}:B{row}'})
data = {'version': 1, 'title': instructions['B1'], 'source': {'url': 'https://docs.google.com/spreadsheets/d/17l4YMfNBw2HSiV0h_LH1e5wKs1LnkRlP/edit?gid=927425884#gid=927425884', 'title': 'Copy of AAOS.xlsx', 'sha256': hashlib.sha256(src.read_bytes()).hexdigest()}, 'required': int(float(scores['J4'])), 'populationMean': float(scores['K4']), 'populationSD': float(scores['L4']), 'questions': questions, 'severity': severity}
(root/'calculator/aaos.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
print('Extracted: 7 questions, original options, 5 severity bands, exact normative constants; no record data exported.')
