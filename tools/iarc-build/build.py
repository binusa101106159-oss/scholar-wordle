"""Import the supplied Wikipedia-print IARC lists, preserving source characters."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import pymupdf

GROUPS = ['1', '2A', '2B', '3']
START = {'Agents', 'Agents and groups of agents'}
STOP = {'See also', 'Notes', 'References', 'External links'}
compact = lambda text: re.sub(r'\s+', '', text)


def extract(path, group):
    doc = pymupdf.open(path)
    entries, pages, headings, expected = [], [], [], []
    active, stack, current, parents = False, [], None, {}
    bullet_count = 0
    for number, page in enumerate(doc, 1):
        pages.append(page.get_text(sort=True))
        assert pages[-1].strip(), ('Empty page', path, number)
        lines = sorted([line for block in page.get_text('dict')['blocks']
                        for line in block.get('lines', [])], key=lambda line: (line['bbox'][1], line['bbox'][0]))
        # These print PDFs draw square list markers as filled paths, not text.
        bullets = [d['rect'] for d in page.get_drawings()
                   if d['fill'] is not None and 3 <= d['rect'].width <= 5
                   and 3 <= d['rect'].height <= 5 and 45 < d['rect'].x0 < 110]
        used = set()
        for line in lines:
            spans = line['spans']
            text = ''.join(span['text'] for span in spans)
            x0, y0, _, y1 = line['bbox']
            size = round(max(s['size'] for s in spans), 1)
            heading = abs(x0 - 43.5) < 1 and all(s['flags'] & 16 for s in spans)
            if heading:
                headings.append({'page': number, 'text': text})
                if text in START:
                    active, stack, current, parents = True, [], None, {}
                elif text in STOP:
                    active, current = False, None
                elif active:
                    while stack and stack[-1][0] <= size:
                        stack.pop()
                    stack.append((size, text))
                    current, parents = None, {}
                continue
            if not active:
                continue
            expected.append(text)
            matches = [i for i, rect in enumerate(bullets)
                       if y0 <= (rect.y0 + rect.y1) / 2 <= y1
                       and 3 < x0 - rect.x1 < 18]
            assert len(matches) <= 1, ('Ambiguous bullet', group, number, text)
            if matches:
                at = matches[0]
                assert at not in used
                used.add(at)
                depth = round((bullets[at].x0 - 51) / 18.75)
                assert depth in (0, 1), (group, number, depth)
                parent = parents.get(depth - 1) if depth else None
                assert not depth or parent is not None, ('Missing parent', group, number, text)
                current = {'id': group + '-' + str(len(entries) + 1), 'group': group,
                           'category': [v for _, v in stack], 'lines': [text],
                           'page': number, 'endPage': number, 'parent': parent}
                entries.append(current)
                parents[depth] = current['id']
                bullet_count += 1
            else:
                assert current is not None, ('Orphan continuation', group, number, text)
                current['lines'].append(text)
                current['endPage'] = number
    for row in entries:
        row['text'] = '\n'.join(row.pop('lines'))
    actual = ''.join(row['text'] for row in entries)
    assert compact(actual) == compact(''.join(expected)), ('Character mismatch', group)
    assert len(entries) == bullet_count and entries
    # A separate marker scan, restricted by the semantic heading boundaries.
    active, markers = False, 0
    for page in doc:
        events = []
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                s = line['spans'];text = ''.join(v['text'] for v in s)
                if abs(line['bbox'][0]-43.5)<1 and all(v['flags']&16 for v in s):
                    events.append((line['bbox'][1], 'heading', text))
        for d in page.get_drawings():
            r=d['rect']
            if d['fill'] is not None and 3<=r.width<=5 and 3<=r.height<=5 and 45<r.x0<110:
                events.append(((r.y0+r.y1)/2, 'marker', None))
        for _,kind,text in sorted(events):
            if kind=='heading':
                if text in START:active=True
                elif text in STOP:active=False
            elif active:markers+=1
    assert markers == len(entries), ('Unparsed list markers', group, markers, len(entries))
    source = {'group': group, 'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'pages': pages, 'headings': headings}
    return source, entries, {'group': group, 'pages': len(doc), 'entries': len(entries),
                             'nested': sum(bool(r['parent']) for r in entries),
                             'characters': len(compact(actual)), 'characterCheck': True, 'markerCheck': True}


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--src',type=Path,required=True)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    args=parser.parse_args()
    sources,entries,reports=[],[],[]
    for group in GROUPS:
        source,rows,report=extract(args.src/('IARC_group_'+group+'.pdf'),group)
        sources.append(source);entries.extend(rows);reports.append(report)
        print(json.dumps(report))
    target=args.root/'iarc';target.mkdir(exist_ok=True)
    (target/'data.json').write_text(json.dumps({'version':1,'sources':sources,'entries':entries},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
    (args.root/'tools/iarc-build/report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8',newline='\n')
