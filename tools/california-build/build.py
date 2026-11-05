"""Build and verify PDRS 2005 calculator data from the official PDF and reference CSVs."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path
import pdfplumber


def build(pdf_path, sources):
    tables = {n: list(csv.DictReader((sources / f'table{n}.csv').open(encoding='utf-8-sig')))
              for n in ('21', '22', '23', '41', '51', '61', '62')}
    with pdfplumber.open(pdf_path) as pdf:
        assert len(pdf.pages) == 89, 'Expected the January 2005, 89-page schedule'
        pages = [p.extract_text(x_tolerance=2, y_tolerance=2) or '' for p in pdf.pages]
    rank_names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
    fec = {r: [] for r in rank_names}
    for index in (25, 26):
        for line in pages[index].splitlines():
            cells = line.split()
            if len(cells) == 21 and cells[0] in fec and all(c.isdigit() for c in cells[1:]):
                fec[cells[0]].extend(map(int, cells[1:]))
    assert all(len(fec[r]) == 100 for r in rank_names)
    for i, row in enumerate(tables['23']):
        assert int(row['FEC Rank']) == i + 1
        assert [int(row[str(w)]) for w in range(1, 101)] == fec[rank_names[i]], ('FEC', i + 1)

    def grid(indices, width):
        result = {}
        for index in indices:
            for line in pages[index].splitlines():
                cells = line.split()
                if cells and len(cells) in (width, width * 2) and all(c.isdigit() for c in cells):
                    for at in range(0, len(cells), width):
                        key = int(cells[at])
                        value = list(map(int, cells[at + 1:at + width]))
                        assert key not in result or result[key] == value
                        result[key] = value
        return result

    occupation = grid((74, 75, 76), 9)
    age = grid((77, 78, 79, 80), 11)
    assert set(occupation) == set(range(101)) and set(age) == set(range(1, 101))
    for number, official in [('51', occupation), ('62', age)]:
        for i, row in enumerate(tables[number]):
            assert [int(row[str(r)]) for r in range(1, 101)] == [official[r][i] for r in range(1, 101)], (number, i)

    groups = list(tables['41'][0])[1:]
    assert len(groups) == 45
    variant_rows, column_pages, aliases = {}, [], []
    for index in range(65, 73):
        lines = pages[index].splitlines()
        columns = lines[0].split()
        assert all(c in groups for c in columns) and len(columns) in (22, 23)
        rows = []
        for line in lines[1:]:
            cells = line.split()
            match = re.match(r'^([\dX.]+(?:\s*--\s*[\dX.]+)?)\s', line)
            letters = cells[-len(columns):]
            if match and all(c in 'CDEFGHIJ' and len(c) == 1 for c in letters):
                key = re.sub(r'\s+', '', match.group(1))
                rows.append((key, dict(zip(columns, letters))))
        column_pages.append(rows)
    for left, right in zip(column_pages[::2], column_pages[1::2]):
        assert len(left) == len(right)
        for (left_key, first), (right_key, second) in zip(left, right):
            # The continuation prints .00 where the first half prints .XX.
            assert left_key.replace('X', '0') == right_key.replace('X', '0'), (left_key, right_key)
            if left_key != right_key:
                aliases.append([left_key, right_key])
            for key in (left_key, right_key):
                variant_rows[key] = {**first, **second}

    def matches(pattern, code):
        if '--' in pattern:
            lo, hi = pattern.split('--')
            return lo.replace('X', '0') <= code[:len(lo)] <= hi.replace('X', '9')
        return bool(re.fullmatch(pattern.replace('.', r'\.').replace('X', r'\d'), code))

    variants, variant_rules = {}, {}
    for row in tables['41']:
        code = row['Impairment Number']
        if all(row[g] == 'X' for g in groups):
            instruction = next((line for page in pages[65:73] for line in page.splitlines()
                                if line.startswith(code) and 'Use variant from' in line), None)
            assert instruction, ('Missing cross-reference instruction', code)
            patterns = re.findall(r'\d{2}\.\d{2}\.(?:\d{2}|XX)\.(?:\d{2}|XX)', instruction.split('Use variant from', 1)[1])
            assert patterns
            variant_rules[code] = {'instruction': instruction, 'patterns': patterns}
            continue
        candidates = [variant_rows[code]] if code in variant_rows else [v for k, v in variant_rows.items() if matches(k, code)]
        assert candidates and all(len(v) == 45 for v in candidates), ('Missing variant', code)
        assert all(v == candidates[0] for v in candidates), ('Ambiguous variant', code)
        value = ''.join(candidates[0][g] for g in groups)
        assert value == ''.join(row[g] for g in groups), ('Variant differs from PDF', code)
        variants[code] = value

    ranks = {}
    for index in range(21, 25):
        for code, rank in re.findall(r'(\d{2}(?:\.\d{2}){3})\s+([1-8])\b', pages[index]):
            ranks[code] = int(rank)
    records = []
    for row in tables['22']:
        code = row['Impairment Number']
        rank = int(row['Rank']) if row['Rank'].isdigit() else None
        if rank is not None:
            assert ranks.get(code) == rank, ('FEC rank differs from PDF', code, ranks.get(code), rank)
        else:
            assert code == '18.00.00.00' and code not in variants
        records.append([code, row['Impairment Description'], rank, row['Category'][:2], variants.get(code, '')])

    chart = {}
    for index, start, width in [(86, 1, 50), (87, 1, 50), (88, 51, 49)]:
        for line in pages[index].splitlines():
            values = []
            for token in line.split():
                if not token.isdigit():
                    break
                values.append(int(token))
            if len(values) < 2:
                continue
            large = values[0]
            count = min(large, width) if start == 1 else large - 50
            if 1 <= large <= 99 and count > 0 and len(values) == count + 1:
                for at, combined in enumerate(values[1:]):
                    chart[large, start + at] = combined
    assert len(chart) == 4950
    for (a, b), value in chart.items():
        assert (a * 100 + b * (100 - a) + 50) // 100 == value, ('Combined chart', a, b)
    # Zero remains zero; the printed FEC/age tables start at a rating of one.
    data = {'version': 'PDRS 2005', 'sources': {
        'official': 'https://www.dir.ca.gov/dwc/PDR.pdf',
        'reference': 'https://hsuli-project-01.uc.r.appspot.com/',
        'tables': 'https://github.com/hsulihuang/AMA_calculator/tree/main/tables',
        'pdfSha256': hashlib.sha256(pdf_path.read_bytes()).hexdigest(), 'continuationAliases': aliases},
        'groups': groups, 'categories': [[r['Category'][:2], r['Category']] for r in tables['21']],
        'impairments': records, 'variantRules': variant_rules, 'fec': [[0] + fec[r] for r in rank_names],
        'occupation': [[occupation[r][i] for r in range(101)] for i in range(8)],
        'age': [[0] + [age[r][i] for r in range(1, 101)] for i in range(10)]}
    fixture = [[chart[a, b] for b in range(1, a + 1)] for a in range(1, 100)]
    return data, fixture


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', type=Path, required=True)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    data, fixture = build(args.pdf, args.sources)
    for name, value in [('calculator/california.json', data), ('tests/fixtures/california-cvc.json', fixture)]:
        path = args.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')
    print('PDF checks: FEC 800; occupation 808; age 1000; variants 9630 + cross-reference rule; ranks 215; combined values 4950: OK')
