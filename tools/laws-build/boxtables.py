"""Rebuild tables drawn with box-drawing glyphs (┌─┬─┐ …) inside law texts as real tables."""
import pdfplumber
from pdfplumber.table import Table
from annex import table_struct, finalize, set_spaces, cluster, remap, same_frame, LIST as LISTSTART

BOX = set('─│┌┐└┘├┤┬┴┼')
# directions each glyph extends: (left, right, up, down)
DIRS = {'─': 'LR', '│': 'UD', '┌': 'RD', '┐': 'LD', '└': 'RU', '┘': 'LU', '├': 'UDR', '┤': 'UDL', '┬': 'LRD', '┴': 'LRU', '┼': 'LRUD'}


def edges_for(chars, pad):
    hs, vs = [], []
    for c in chars:
        d = DIRS[c['text']]
        cx, cy = (c['x0'] + c['x1']) / 2, (c['top'] + c['bottom']) / 2
        if 'L' in d: hs.append((c['x0'] - 0.6, cx, cy))
        if 'R' in d: hs.append((cx, c['x1'] + 0.6, cy))
        if 'U' in d: vs.append((cx, c['top'] - pad, cy))
        if 'D' in d: vs.append((cx, cy, c['bottom'] + pad))
    H = [dict(x0=a, x1=b, top=y, bottom=y, width=b - a, height=0, object_type='line') for a, b, y in hs]
    V = [dict(x0=x, x1=x, top=a, bottom=b, width=0, height=b - a, object_type='line') for x, a, b in vs]
    return H, V


def box_tables(path):
    out = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            chars = [c for c in page.chars if c['text'] in BOX]
            if not chars: continue
            # line pitch: gap between consecutive glyph rows, so vertical strokes join across text lines
            tops = sorted({round(c['top'], 1) for c in chars})
            gaps = [b - a for a, b in zip(tops, tops[1:]) if b - a > 1]
            h = max(c['bottom'] - c['top'] for c in chars)
            pad = max(1.0, (min(gaps) - h) / 2 + 1.2) if gaps else 2
            H, V = edges_for(chars, pad)
            if len(H) < 2 or len(V) < 1: continue
            # a table cut by the page break has no border at the cut: add a virtual one
            x0, x1 = min(c['x0'] for c in chars), max(c['x1'] for c in chars)
            top, bot = min(c['top'] for c in chars), max(c['bottom'] for c in chars)
            first = [c for c in chars if c['top'] - top < 2]
            last = [c for c in chars if bot - c['bottom'] < 2]
            open_top = not any(c['text'] in '┌┐┬─' for c in first)
            open_bot = not any(c['text'] in '└┘┴─' for c in last)
            if open_top:
                y = top - pad; H.append(dict(x0=x0, x1=x1, top=y, bottom=y, width=x1 - x0, height=0, object_type='line'))
            if open_bot:
                y = bot + pad; H.append(dict(x0=x0, x1=x1, top=y, bottom=y, width=x1 - x0, height=0, object_type='line'))
            settings = dict(vertical_strategy='explicit', horizontal_strategy='explicit', explicit_vertical_lines=V,
                            explicit_horizontal_lines=H, snap_tolerance=2, join_tolerance=2, intersection_tolerance=2.5,
                            edge_min_length=1)
            finder = page.debug_tablefinder(settings)
            tables = list(finder.tables)
            # pdfplumber omits isolated one-cell grids. A page may contain only
            # the continuation of a full-width note/form cell and its bottom border.
            used = {cell for table in tables for cell in table.cells}
            tables.extend(Table(page, [cell]) for cell in finder.cells if cell not in used)
            text_page = page.filter(lambda o: o.get('object_type') != 'char' or o.get('text') not in BOX)
            words = text_page.extract_words(x_tolerance=1.5, y_tolerance=2, return_chars=True)
            set_spaces(page)
            for t in sorted(tables, key=lambda t: t.bbox[1]):
                st = table_struct(page, t, words, [], None)
                # does this table close on this page? (an └ glyph at its bottom edge)
                closes = any(c['text'] in '└┘┴' and abs(c['bottom'] - t.bbox[3]) < 12 for c in chars)
                opens = any(c['text'] in '┌┐┬' and abs(c['top'] - t.bbox[1]) < 12 for c in chars)
                cut_top = open_top and abs(t.bbox[1] - (top - pad)) < 3
                if out and not opens and not out[-1].get('_closed') and same_frame(out[-1], st):
                    prev = out[-1]
                    if len(prev['xs']) != len(st['xs']):
                        # A spanning continuation cell has no internal column lines
                        # on this page. Keep the established outer table's columns.
                        grid = cluster(prev['xs'] + st['xs'], 3)
                        remap(prev, grid); remap(st, grid)
                    rows = st['rows']
                    if cut_top and prev.get('_cut') and rows and \
                            [(c['c'], c['cs']) for c in rows[0]] == [(c['c'], c['cs']) for c in prev['rows'][-1]]:
                        # stitch the row that the page break split in two
                        for a, b in zip(prev['rows'][-1], rows[0]):
                            if b['text']:
                                a['text'] = (a['text'] + ('\n' if LISTSTART.match(b['text']) else '') + b['text']) if a['text'] else b['text']
                        rows = rows[1:]
                    prev['rows'] += rows
                    prev['_closed'] = closes
                    prev['_cut'] = open_bot and abs(t.bbox[3] - (bot + pad)) < 3
                    continue
                st['_closed'] = closes
                st['_cut'] = open_bot and abs(t.bbox[3] - (bot + pad)) < 3
                out.append(st)
    for st in out:
        for k in ('_closed', '_cut'): st.pop(k, None)
    finalize(out)
    return out
