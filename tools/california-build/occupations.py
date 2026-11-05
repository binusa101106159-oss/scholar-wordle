"""Extract the official two-column PDRS 2005 occupation index without merging rows."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import pdfplumber


def extract(pdf_path, groups):
    records, counts = [], []
    with pdfplumber.open(pdf_path) as pdf:
        assert len(pdf.pages) == 89
        for page_index in range(28, 53):
            words = pdf.pages[page_index].extract_words(x_tolerance=2, y_tolerance=1.5)
            page_count = 0
            for code_x, name_x, industry_x, right in [(72, 108, 292, 410), (423, 459, 643, 780)]:
                # One printed 390 is shifted >2 points. Include all numeric row anchors
                # before validating group membership, so a missed code cannot merge jobs.
                anchors = sorted([w for w in words if re.fullmatch(r'\d{2,4}[A-Za-z*]?', w['text'])
                                  and abs(w['x0'] - code_x) < 3], key=lambda w: w['top'])
                if not anchors:
                    assert not [w for w in words if code_x - 2 <= w['x0'] < right and 80 < w['top'] < 575], ('Unparsed column', page_index + 1)
                    continue
                for at, anchor in enumerate(anchors):
                    assert anchor['text'] in groups, ('Unknown printed group', page_index + 1, anchor)
                    top = anchor['top'] - 2
                    bottom = anchors[at + 1]['top'] - 2 if at + 1 < len(anchors) else 575
                    cells = [w for w in words if name_x - 2 <= w['x0'] < right and top <= w['top'] < bottom]
                    title = [w for w in cells if w['x0'] < industry_x - 2]
                    industry = [w for w in cells if w['x0'] >= industry_x - 2]
                    assert len(title) + len(industry) == len(cells)
                    def text(items):
                        return ' '.join(w['text'] for w in sorted(items, key=lambda w: (round(w['top'] / 2) * 2, w['x0'])))
                    assert title
                    records.append([anchor['text'], text(title), text(industry), page_index + 1])
                    page_count += 1
                late = [w for w in words if name_x - 2 <= w['x0'] < right and 575 <= w['top'] < 590
                        and not re.fullmatch(r'3-\d+', w['text'])]
                assert not late, ('Unassigned page-bottom words', page_index + 1, late)
            counts.append(page_count)
    assert len(records) == 1812, ('Occupation count changed', len(records))
    return {'version': 'PDRS 2005', 'source': 'https://www.dir.ca.gov/dwc/PDR.pdf',
            'pdfSha256': hashlib.sha256(pdf_path.read_bytes()).hexdigest(), 'jobs': records}, counts


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    data = json.loads((args.root / 'calculator/california.json').read_text(encoding='utf-8'))
    result, counts = extract(args.pdf, set(data['groups']))
    assert result['pdfSha256'] == data['sources']['pdfSha256']
    target = args.root / 'calculator/california-occupations.json'
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')
    print('Official occupation index: 1812 rows, 25 pages, all groups and row boundaries checked: OK')
    print('Rows per page:', counts)
