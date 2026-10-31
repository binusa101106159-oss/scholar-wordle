"""Build the AMA reader from the supplied book, without changing other readers.

Layout hints locate printed objects, never supply their wording. All visible
characters, including table cells and figure labels, come from PDF text runs.
Every retained character has one owner; the build fails on omissions/duplicates.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import html
import json
import os
from pathlib import Path
import re

import pymupdf as pdf

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = Path(r"A:\職醫\AMA\AMA Guides to the Evaluation of Permanent Impairment, 6e.pdf")
GLYPHS = {"H11001": "+", "H11005": "="}
CHAPTERS = {"c01": (1, 18), "c02": (19, 30), "c03": (31, 46)}

# Printed object extents in cropped PDF points. These contain no transcriptions.
TABLES = {
    7: [("1-1", (72, 59, 291, 445), "list", (72, 84, 291, 432))],
    8: [("1-2", (320, 600, 541, 720), "list", (320, 625, 541, 720))],
    11: [("1-3", (320, 73, 541, 198), "list", (320, 98, 541, 198)),
         ("1-4", (320, 534, 541, 716), "grid", (320, 577, 541, 716))],
    13: [("1-5", (71, 59, 541, 736), "composite", None)],
    14: [("1-6", (320, 404, 541, 718), "list", (320, 440, 541, 718))],
    20: [("2-1", (71, 398, 541, 735), "list", (71, 423, 541, 735))],
    40: [("3-1", (320, 72, 541, 223), "grid", (320, 117, 541, 223))],
}
FIGURES = {
    3: [("1-1", (71, 408, 541, 737), (72, 440, 540, 737))],
    4: [("1-2", (78, 510, 535, 680), (78, 544, 534, 649))],
    22: [("2-1", (71, 59, 541, 286), (72, 88, 540, 285)),
         ("2-2", (71, 421, 541, 739), (72, 450, 540, 739))],
    30: [("2-3", (71, 59, 541, 735), None)],
    33: [("3-1", (71, 346, 541, 745), (99, 459, 513, 724))],
}
SIDEBARS = {
    4: [(72, 60, 540, 683)], 6: [(321, 60, 540, 483)],
    7: [(321, 60, 541, 507)], 8: [(72, 60, 291, 309)],
    9: [(72, 593, 291, 734), (321, 60, 540, 406)],
    27: [(321, 72, 541, 526)], 29: [(72, 72, 541, 567)],
}


def esc(value):
    return html.escape(str(value), quote=True)


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def canon(value):
    return "".join(c for c in value if not c.isspace())


def inside(char, box):
    a, b, c, d = char["bbox"]
    return box[0] - .05 <= (a+c)/2 <= box[2] + .05 and box[1] - .05 <= (b+d)/2 <= box[3] + .05


def extent(chars):
    return (min(c["bbox"][0] for c in chars), min(c["bbox"][1] for c in chars),
            max(c["bbox"][2] for c in chars), max(c["bbox"][3] for c in chars))


def symbol_map(doc, page):
    mappings = {}
    for xref, _, _, name, *_ in page.get_fonts(full=True):
        name = re.sub(r"^[A-Z]{6}\+", "", name)
        if "MathematicalPi" not in name:
            continue
        kind, encoding = doc.xref_get_key(xref, "Encoding")
        encoding = doc.xref_object(int(encoding.split()[0])) if kind == "xref" else encoding
        match = re.search(r"/Differences\s*\[([^]]+)\]", encoding, re.S)
        if not match:
            raise ValueError(f"No encoding for {name}")
        code, mapping = 0, {}
        for token in match[1].split():
            if token.isdigit():
                code = int(token)
            elif token.startswith("/"):
                glyph = token[1:]
                value = GLYPHS.get(glyph)
                if value is None:
                    uni = pdf.glyph_name_to_unicode(glyph)
                    if uni == 65533:
                        raise ValueError(f"Unknown mathematical glyph {glyph}")
                    value = chr(uni)
                mapping[code] = value
                code += 1
        if name in mappings and mappings[name] != mapping:
            raise ValueError("Ambiguous same-name mathematical font")
        mappings[name] = mapping
    return mappings


class Page:
    def __init__(self, doc, number):
        self.number, self.page = number, doc[number+24]
        self.chars, self.owners, self.excluded, self.sections = [], {}, [], []
        self.attachments, self.grids, self.vectors, self.rules = [], [], [], []
        maps = symbol_map(doc, self.page)
        for bi, block in enumerate(self.page.get_text("rawdict")["blocks"]):
            if block["type"] != 0:
                box = block["bbox"]
                if block["type"] == 1 and box[3]-box[1] < 2 and box[2]-box[0] > 400:
                    self.rules.append(dict(box=box, html='<hr class="ax-source-rule">'))
                    continue
                raise ValueError(f"Unexpected raster object on page {number}")
            for li, line in enumerate(block["lines"]):
                for si, span in enumerate(line["spans"]):
                    font = re.sub(r"^[A-Z]{6}\+", "", span["font"])
                    for ci, char in enumerate(span["chars"]):
                        text = char["c"]
                        if font in maps and ord(text) in maps[font]:
                            text = maps[font][ord(text)]
                        item = dict(char, text=text, font=font, size=span["size"],
                                    flags=span["flags"], line=(bi, li), span=(bi, li, si),
                                    uid=(bi, li, si, ci), block=bi)
                        # Running heads, chapter edge tabs and printer furniture
                        # are audited separately; the reader supplies page labels.
                        if inside(item, (60, 45, 555, 750)):
                            if any(ord(c) < 32 and not c.isspace() for c in text) or "\ufffd" in text:
                                raise ValueError(f"Unreadable character {number}: {text!r}/{font}")
                            self.chars.append(item)
                        else:
                            self.excluded.append(item)

    def take(self, chars, owner):
        for char in chars:
            uid = char["uid"]
            if uid in self.owners:
                raise ValueError(f"Duplicate character p{self.number}: {uid}")
            self.owners[uid] = owner

    def select(self, chars, box):
        return [c for c in chars if inside(c, box)]

    def rich(self, chars, *, lines=False):
        """Keep source run order, styles, reference superscripts, and line hyphens."""
        groups = defaultdict(list)
        for c in chars:
            groups[c["line"]].append(c)
        result = []
        for _, line in sorted(groups.items()):
            line.sort(key=lambda c: c["uid"])
            dominant = max((c["size"] for c in line), default=10)
            spans = defaultdict(list)
            for c in line:
                spans[c["span"]].append(c)
            out = []
            for _, run in sorted(spans.items()):
                text = "".join(c["text"] for c in run)
                if not text:
                    continue
                first = run[0]
                value = esc(text)
                if first["flags"] & 2 or "Italic" in first["font"] or "Oblique" in first["font"]:
                    value = "<em>" + value + "</em>"
                if first["flags"] & 16 or any(name in first["font"] for name in ("Bold","Black","Heavy")):
                    value = "<strong>" + value + "</strong>"
                if first["size"] < dominant * .82 and (first["flags"] & 1):
                    value = "<sup>" + value + "</sup>"
                out.append(value)
            result.append("".join(out))
        if lines:
            return "<br>".join(result)
        # Whitespace at printed line breaks is layout, not a new word character.
        joined = ""
        for value in result:
            # Preserve the printed hyphen while removing only the layout gap.
            suffix = re.sub(r"<[^>]+>", "", joined).rstrip()
            joined += ("" if not joined or suffix.endswith(("-", "‐", "‑")) else " ") + value
        return joined

    def paragraphs(self, chars, owner="body", headings=True):
        groups = defaultdict(list)
        for c in chars:
            groups[c["block"]].append(c)
        nodes = []
        for bi, block in groups.items():
            linegroups = defaultdict(list)
            for c in block:
                linegroups[c["line"]].append(c)
            segments, previous = [], None
            for key, line in sorted(linegroups.items()):
                text = clean("".join(c["text"] for c in line))
                kind = "p"
                if headings and text:
                    if any("Ellington" in c["font"] and c["size"] >= 14 for c in line):
                        kind = "h2"
                    elif any("Bold" in c["font"] and c["size"] >= 10.9 for c in line):
                        kind = "h3"
                    else:
                        ink=[c for c in line if canon(c['text'])]
                        # Smaller all-bold lines are printed subheadings, often
                        # in the same PDF block as the following body paragraph.
                        # Chapter contents use a small Ellington face instead.
                        if ink and max(c['size'] for c in ink)>=9.5 and not any('Ellington' in c['font'] for c in ink):
                            if all(c['flags'] & 16 or any(name in c['font'] for name in ('Bold','Black','Heavy')) for c in ink):
                                kind='h3'
                starts_item=bool(re.match(r'^(?:•|\d{1,2}[.)]\s|[a-z]\.\s)',text))
                if kind != previous or starts_item:
                    segments.append((kind, []))
                segments[-1][1].extend(line)
                previous = kind
            for si, (tag, segment) in enumerate(segments):
                if not canon("".join(c["text"] for c in segment)):
                    self.take(segment, owner)
                    continue
                anchor = f"p{self.number}-b{bi}-{si}"
                value = self.rich(segment)
                self.take(segment, owner)
                nodes.append(dict(box=extent(segment), html=f'<{tag} id="{anchor}">{value}</{tag}>'))
                title = clean("".join(c["text"] for c in segment))
                if headings and tag in ("h2", "h3"):
                    self.sections.append(dict(id=anchor, title=title, page=self.number, level=int(tag[-1])))
        return nodes

    def flow(self, nodes):
        full = sorted([n for n in nodes if n["box"][0] < 300 and n["box"][2] > 310], key=lambda n: n["box"][1])
        columns = [n for n in nodes if n not in full]
        output = []
        for wide in full + [None]:
            threshold = wide["box"][1] if wide else float("inf")
            before = [n for n in columns if (n["box"][1]+n["box"][3])/2 < threshold]
            for col in (0, 1):
                output.extend(n["html"] for n in sorted(before, key=lambda n: n["box"][1]) if (n["box"][0] >= 300) == bool(col))
            columns = [n for n in columns if n not in before]
            if wide:
                output.append(wide["html"])
        return "".join(output)

    def svg(self, chars, box, owner):
        """Original vector artwork only; labels remain selectable SVG text."""
        x0, y0, x1, y1 = box
        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" class="ax-vector" viewBox="{x0} {y0} {x1-x0} {y1-y0}" role="img" aria-label="原書圖形">',
                 f'<defs><clipPath id="clip-{self.number}-{owner}"><rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}"/></clipPath></defs>',
                 f'<g clip-path="url(#clip-{self.number}-{owner})">']
        for draw in self.page.get_drawings():
            rect = draw["rect"]
            # Only paths belonging to this actual picture. Exclude page/printer boxes.
            # A horizontal/vertical stroke has a zero-area rectangle. Rect's
            # intersects() deliberately rejects these; they are still ink.
            overlaps = rect.x1 >= x0 and rect.x0 <= x1 and rect.y1 >= y0 and rect.y0 <= y1
            # One PDF path can combine a sidebar border with several diagram
            # boxes. Clip the original path rather than dropping the entire
            # drawing when its union bounds extend outside this picture.
            if not overlaps:
                continue
            path = []
            last = None
            def move(point):
                nonlocal last
                if last is None or abs(point.x-last.x)>.001 or abs(point.y-last.y)>.001:
                    path.append(f'M{point.x:.3f},{point.y:.3f}')
            for item in draw["items"]:
                op = item[0]
                if op == "l":
                    a, b = item[1:]; move(a)
                    path.append(f'L{b.x:.3f},{b.y:.3f}'); last = b
                elif op == "c":
                    a, b, c, d = item[1:]; move(a)
                    path.append(f'C{b.x:.3f},{b.y:.3f} {c.x:.3f},{c.y:.3f} {d.x:.3f},{d.y:.3f}'); last = d
                elif op == "re":
                    r = item[1]
                    path.append(f'M{r.x0:.3f},{r.y0:.3f}H{r.x1:.3f}V{r.y1:.3f}H{r.x0:.3f}Z'); last = None
                elif op == "qu":
                    q = item[1]
                    path.append(f'M{q.ul.x:.3f},{q.ul.y:.3f}L{q.ur.x:.3f},{q.ur.y:.3f}L{q.lr.x:.3f},{q.lr.y:.3f}L{q.ll.x:.3f},{q.ll.y:.3f}Z'); last = None
                else:
                    raise ValueError(f"Unsupported vector instruction: {op}")
            if draw.get("closePath"):
                path.append("Z")
            def color(value):
                return "none" if value is None else "#" + "".join(f"{round(max(0,min(1,c))*255):02x}" for c in value)
            attrs = f'fill="{color(draw.get("fill"))}" stroke="{color(draw.get("color"))}" stroke-width="{(draw.get("width") or 0):.3f}"'
            if draw.get("color") is not None and not draw.get("width"):
                attrs = attrs.replace('stroke-width="0.000"', 'stroke-width="1" vector-effect="non-scaling-stroke"')
            if draw.get("even_odd"):
                attrs += ' fill-rule="evenodd"'
            if draw.get("fill_opacity", 1) != 1:
                attrs += f' fill-opacity="{draw["fill_opacity"]}"'
            if draw.get("stroke_opacity", 1) != 1:
                attrs += f' stroke-opacity="{draw["stroke_opacity"]}"'
            parts.append(f'<path d="{" ".join(path)}" {attrs}/>')
        # Char-level x positions preserve source kerning without shipping fonts.
        runs = defaultdict(list)
        for char in chars:
            runs[char["span"]].append(char)
        for _, run in sorted(runs.items()):
            first = run[0]
            family = "Georgia,serif" if "Times" in first["font"] else "Arial,sans-serif"
            attrs = f'font-family="{family}" font-size="{first["size"]:.3f}" fill="#222"'
            if "Italic" in first["font"]:
                attrs += ' font-style="italic"'
            if "Bold" in first["font"]:
                attrs += ' font-weight="bold"'
            glyphs=[]
            for c in run:
                width=max(.01,c["bbox"][2]-c["bbox"][0])
                glyphs.append(f'<tspan x="{c["origin"][0]:.3f}" textLength="{width:.3f}" lengthAdjust="spacingAndGlyphs">{esc(c["text"])}</tspan>')
            parts.append(f'<text y="{first["origin"][1]:.3f}" {attrs} xml:space="preserve">{"".join(glyphs)}</text>')
        self.take(chars, owner)
        parts.extend(["</g>", "</svg>"])
        self.vectors.append(dict(owner=owner, box=box, characters=len(canon("".join(c["text"] for c in chars)))))
        return "".join(parts)

    def grid(self, chars, table, owner, decorated=False):
        cells = list(dict.fromkeys(tuple(c) for row in table.rows for c in row.cells if c))
        xs = sorted(set(round(c[i], 3) for c in cells for i in (0, 2)))
        ys = sorted(set(round(c[i], 3) for c in cells for i in (1, 3)))
        if decorated:
            # A dark filled header masks vertical strokes from the line detector.
            # Keep each printed header row distinct at the fill's bottom edge.
            cuts = []
            for draw in self.page.get_drawings():
                r = draw["rect"]
                if draw.get("fill") and r.width > (xs[-1]-xs[0])*.5 and 5 < r.height < 30:
                    cuts.extend(y for y in ys if abs(y-r.y1)<.8)
            split = []
            for c in cells:
                edges = [c[1]]+[y for y in cuts if c[1]+.1<y<c[3]-.1]+[c[3]]
                split.extend((c[0], a, c[2], b) for a, b in zip(edges, edges[1:]))
            cells = split
        matrix = [[None]*(len(xs)-1) for _ in range(len(ys)-1)]
        assigned, specs = set(), []
        rows = []
        for ri in range(len(ys)-1):
            row = []
            for ci in range(len(xs)-1):
                match = next((c for c in cells if abs(c[0]-xs[ci])<.1 and abs(c[1]-ys[ri])<.1), None)
                if match is None:
                    continue
                endc = min(range(len(xs)), key=lambda i: abs(xs[i]-match[2]))
                endr = min(range(len(ys)), key=lambda i: abs(ys[i]-match[3]))
                cs, rs = endc-ci, endr-ri
                for r in range(ri, endr):
                    for c in range(ci, endc):
                        if matrix[r][c] is not None:
                            raise ValueError("Overlapping native table cells")
                        matrix[r][c] = (ri, ci)
                selected = [c for c in chars if c["uid"] not in assigned and inside(c, match)]
                assigned.update(c["uid"] for c in selected)
                if decorated and ri == 0:
                    value = self.svg(selected, match, owner+"-ornament")
                else:
                    self.take(selected, f"{owner}-r{ri}c{ci}")
                    value = self.flow(self.paragraphs_preview(selected))
                attrs = (f' colspan="{cs}"' if cs>1 else "")+(f' rowspan="{rs}"' if rs>1 else "")
                cls = ' class="ax-grid-ornament"' if decorated and ri == 0 else ""
                row.append(f'<td{attrs}{cls}>{value}</td>')
                specs.append(dict(row=ri, col=ci, rowspan=rs, colspan=cs, box=match,
                                  text="".join(c["text"] for c in selected)))
            rows.append("<tr>"+"".join(row)+"</tr>")
        if any(value is None for row in matrix for value in row):
            raise ValueError(f"Uncovered table slots {owner}")
        leftover = [c for c in chars if c["uid"] not in assigned]
        if canon("".join(c["text"] for c in leftover)):
            raise ValueError(f"Table missed text: {owner}: {clean(''.join(c['text'] for c in leftover))[:80]}")
        self.take(leftover, owner+"-whitespace")
        self.grids.append(dict(id=owner, rows=len(ys)-1, cols=len(xs)-1, cells=specs))
        widths = [f'<col style="width:{(b-a)/(xs[-1]-xs[0])*100:.3f}%">' for a,b in zip(xs,xs[1:])]
        return '<div class="ax-table-wrap"><table class="ax-table"><colgroup>'+"".join(widths)+'</colgroup><tbody>'+"".join(rows)+'</tbody></table></div>'

    def paragraphs_preview(self, chars):
        # Cells have already claimed their source characters.
        groups = defaultdict(list)
        for c in chars:
            groups[c["block"]].append(c)
        return [dict(box=extent(v), html="<p>"+self.rich(v)+"</p>") for v in groups.values() if canon("".join(c["text"] for c in v))]

    def formal_table(self, chars, ident, mode, bodybox):
        owner = "table-"+ident
        if mode == "composite":
            tables = self.page.find_tables(strategy="lines_strict").tables
            nodes, remaining = [], list(chars)
            for ti, table in enumerate(tables):
                selected = self.select(remaining, table.bbox)
                remaining = [c for c in remaining if c not in selected]
                nodes.append(dict(box=table.bbox, html=self.grid(selected, table, f"{owner}-{ti}", decorated=(ti==0))))
            nodes.extend(self.paragraphs(remaining, owner, headings=False))
            return self.flow(nodes)
        body = self.select(chars, bodybox)
        others = [c for c in chars if c not in body]
        nodes = self.paragraphs(others, owner, headings=False)
        if mode == "grid":
            tables = [t for t in self.page.find_tables(strategy="lines_strict").tables if pdf.Rect(t.bbox).intersects(pdf.Rect(bodybox))]
            if len(tables) != 1:
                raise ValueError(f"Expected one table: {ident}")
            value = self.grid(body, tables[0], owner)
        else:
            groups = defaultdict(list)
            for c in body:
                groups[c["block"]].append(c)
            rows, specs = [], []
            for _, row in sorted(groups.items(), key=lambda pair: extent(pair[1])[1]):
                if not canon("".join(c["text"] for c in row)):
                    self.take(row, owner)
                    continue
                self.take(row, f"{owner}-r{len(rows)}")
                specs.append(dict(row=len(rows),col=0,rowspan=1,colspan=1,box=extent(row),text=''.join(c['text'] for c in row)))
                rows.append("<tr><td>"+self.rich(row)+"</td></tr>")
            self.grids.append(dict(id=owner, rows=len(rows), cols=1,cells=specs))
            value = '<div class="ax-table-wrap"><table class="ax-table ax-list-table"><tbody>'+"".join(rows)+"</tbody></table></div>"
        nodes.append(dict(box=bodybox, html=value))
        return self.flow(nodes)

    def field_row(self, block, owner):
        lines=defaultdict(list)
        for c in block:
            lines[c["line"]].append(c)
        printed=[v for v in lines.values() if canon(''.join(c['text'] for c in v))]
        baselines=[c['origin'][1] for c in block]
        if len(printed)<2 or max(baselines)-min(baselines)>=1:
            return None
        printed.sort(key=lambda v:extent(v)[0])
        starts=[extent(v)[0] for v in printed]+[540]
        widths=[b-a for a,b in zip(starts,starts[1:])]
        cells=['<div>'+self.rich(v)+'<span class="ax-form-blank" aria-hidden="true"></span></div>' for v in printed]
        value='<div class="ax-form-fields" style="grid-template-columns:'+(' '.join(f'{w:.3f}fr' for w in widths))+'">'+''.join(cells)+'</div>'
        self.take(block,owner)
        return dict(box=extent(block),html=value)

    def report_form(self, chars):
        table = next(t for t in self.page.find_tables(strategy="lines_strict").tables if t.col_count==6 and t.row_count==4)
        selected = self.select(chars, table.bbox)
        remaining = [c for c in chars if c not in selected]
        nodes = [dict(box=table.bbox, html=self.grid(selected, table, "figure-2-3-grid"))]
        # Fields sharing a baseline have real blank areas between them. A plain
        # paragraph would collapse those spaces and run the labels together.
        blocks=defaultdict(list)
        for c in remaining:
            blocks[c["block"]].append(c)
        for block in blocks.values():
            box=extent(block)
            field=self.field_row(block,'figure-2-3-fields') if box[1]>100 else None
            if field:
                nodes.append(field)
            else:
                for node in self.paragraphs(block, "figure-2-3", headings=False):
                    if node["box"][1] > 100:
                        node["html"] = '<div class="ax-form-field">'+node["html"]+'</div>'
                    nodes.append(node)
        return '<div class="ax-report-form">'+self.flow(nodes)+"</div>"

    def pdq(self, chars):
        groups = defaultdict(list)
        for c in chars:
            groups[c["block"]].append(c)
        nodes, questions = [], 0
        for _, block in sorted(groups.items(), key=lambda pair: extent(pair[1])[1]):
            text = clean("".join(c["text"] for c in block))
            if not re.match(r"\d{1,2}\.\s", text):
                box=extent(block)
                field=self.field_row(block,'appendix-3-1-fields') if 110<box[1]<124 else None
                if field:
                    nodes.append(field)
                    continue
                if 690<box[1]<711:
                    ink=extent([c for c in block if canon(c['text'])])
                    width=(540-ink[0])/468*100
                    self.take(block,'appendix-3-1-signature')
                    nodes.append(dict(box=box,html=f'<div class="ax-form-signature" style="width:{width:.3f}%">'+self.rich(block)+'</div>'))
                    continue
                nodes.extend(self.paragraphs(block, "appendix-3-1", headings=False))
                continue
            lines = defaultdict(list)
            for c in block:
                lines[round(c["origin"][1], 1)].append(c)
            linevalues = [v for _,v in sorted(lines.items())]
            scale = linevalues[-1]
            endpoints = linevalues[-2]
            question = [c for v in linevalues[:-2] for c in v]
            left = [c for c in endpoints if c["bbox"][0] < 300]
            right = [c for c in endpoints if c not in left]
            self.take(block, "appendix-3-1-q"+str(questions+1))
            scale_text = clean("".join(c["text"] for c in scale))
            if re.findall(r"\d+", scale_text) != [str(n) for n in range(11)]:
                raise ValueError("PDQ scale lost a printed number")
            value = '<table class="ax-table ax-pdq"><tbody><tr><td colspan="2">'+self.rich(question)+'</td></tr><tr><td>'+self.rich(left)+'</td><td>'+self.rich(right)+'</td></tr><tr><td colspan="2" class="ax-pdq-scale">'+self.rich(scale)+'</td></tr></tbody></table>'
            nodes.append(dict(box=extent(block), html=value))
            self.grids.append(dict(id='appendix-3-1-q'+str(questions+1),rows=3,cols=2,cells=[
                dict(row=r,col=c,rowspan=1,colspan=cs,text=''.join(ch['text'] for ch in selected))
                for r,c,cs,selected in [(0,0,2,question),(1,0,1,left),(1,1,1,right),(2,0,2,scale)]]))
            questions += 1
        if questions != 15:
            raise ValueError(f"Expected 15 PDQ items, found {questions}")
        self.grids.append(dict(id="appendix-3-1", questions=questions, scales=15, cols=2))
        return self.flow(nodes)

    def region(self, chars, box, kind, ident, body=None, mode=None):
        anchor = ("t" if kind=="table" else "f" if kind=="figure" else "ap")+ident
        if kind == "table":
            value = self.formal_table(chars, ident, mode, body)
        elif kind == "figure" and body:
            artchars = self.select(chars, body)
            remaining = [c for c in chars if c not in artchars]
            nodes = self.paragraphs(remaining, "figure-"+ident, headings=False)
            nodes.append(dict(box=body, html=self.svg(artchars, body, "figure-"+ident)))
            value = self.flow(nodes)
        elif kind == "figure":
            value = self.report_form(chars)
        elif ident == "3-1":
            value = self.pdq(chars)
        else:
            value = self.flow(self.paragraphs(chars, "appendix-"+ident, headings=False))
        label = ("Table " if kind=="table" else "Figure " if kind=="figure" else "Appendix ")+ident
        self.attachments.append(dict(id=anchor, label=label, page=self.number, html=value, kind=kind))
        return dict(box=box, html=f'<section class="ax-object ax-object-{kind}" id="{anchor}" data-attachment="{anchor}">{value}<button type="button" class="ax-expand" data-open="{anchor}" aria-label="放大 {label}">放大檢視</button></section>')

    def build(self):
        remaining = list(self.chars)
        def take_region(box):
            nonlocal remaining
            selected = self.select(remaining, box)
            remaining = [c for c in remaining if c not in selected]
            return selected
        nodes = list(self.rules)
        # Claims are nested: objects inside a sidebar are rendered inside that box.
        for box in SIDEBARS.get(self.number, []):
            selected = take_region(box)
            nested, rest = self.objects(selected)
            nested.extend(self.paragraphs(rest, "sidebar"))
            nodes.append(dict(box=box, html='<aside class="ax-note">'+self.flow(nested)+"</aside>"))
        objects, remaining = self.objects(remaining)
        nodes.extend(objects)
        nodes.extend(self.paragraphs(remaining))
        value = self.flow(nodes)
        self.sections.sort(key=lambda section:value.find('id="'+section['id']+'"'))
        if len(self.owners) != len(self.chars):
            raise ValueError(f"Character ownership failed p{self.number}: {len(self.owners)}/{len(self.chars)}")
        # Independent HTML text round trip, including native SVG text.
        from html.parser import HTMLParser
        class Text(HTMLParser):
            def __init__(self): super().__init__(convert_charrefs=True); self.parts=[]; self.ui=False
            def handle_starttag(self, tag, attrs):
                if tag=="button": self.ui=True
            def handle_endtag(self, tag):
                if tag=="button": self.ui=False
            def handle_data(self, text):
                if not self.ui: self.parts.append(text)
        parser = Text(); parser.feed(value)
        original = "".join(c["text"] for c in self.chars)
        actual = "".join(parser.parts)
        if Counter(canon(original)) != Counter(canon(actual)):
            raise ValueError(f"HTML character mismatch p{self.number}: "+str(Counter(canon(original))-Counter(canon(actual))))
        return dict(page=self.number, html=value), dict(page=self.number, characters=len(canon(original)),
            owned=len(self.owners), grids=self.grids, vectors=self.vectors,
            excluded=clean("".join(c["text"] for c in self.excluded)), status="OK")

    def objects(self, chars):
        remaining, nodes = list(chars), []
        regions = [("table", ident, box, body, mode) for ident,box,mode,body in TABLES.get(self.number, [])]
        regions += [("figure", ident, box, art, None) for ident,box,art in FIGURES.get(self.number, [])]
        if self.number in (43,44,45):
            regions.append(("appendix", f"3-{self.number-42}", (71, 93 if self.number==43 else 70, 542, 735), None, None))
        for kind,ident,box,body,mode in regions:
            selected = self.select(remaining, box)
            if not selected:
                continue
            remaining = [c for c in remaining if c not in selected]
            nodes.append(self.region(selected, box, kind, ident, body, mode))
        return nodes, remaining


def add_links(value, known, current):
    """References are linked only when the cited original object is imported."""
    from html.parser import HTMLParser
    pattern = re.compile(r"\b(Tables?|Fig(?:ure)?s?\.?|Appendix(?:es)?)\s*(\d+)[-–](\d+)(?:\s+(?:and|to|through)\s+(?:(\d+)[-–])?(\d+))?",re.I)
    class Linker(HTMLParser):
        def __init__(self): super().__init__(convert_charrefs=False); self.out=[]; self.skip=0
        def handle_starttag(self, tag, attrs):
            raw=self.get_starttag_text(); self.out.append(raw)
            if tag in ("svg","button"): self.skip += 1
        def handle_startendtag(self, tag, attrs): self.out.append(self.get_starttag_text())
        def handle_endtag(self, tag):
            self.out.append(f'</{tag}>')
            if tag in ("svg","button"): self.skip -= 1
        def handle_data(self, text):
            if self.skip: self.out.append(text); return
            def replace(m):
                kind="t" if m[1].lower().startswith("table") else "f" if m[1].lower().startswith("fig") else "ap"
                key=f'{kind}{m[2]}-{m[3]}'
                if key not in known: return m[0]
                target=known[key]
                first_end=m.end(3)-m.start()
                result=f'<a href="#ama" class="ax-ref" data-chapter="{target}" data-open="{key}">{m[0][:first_end]}</a>'
                if not m[5]:
                    return result
                second_start=(m.start(4) if m[4] else m.start(5))-m.start()
                second=f'{kind}{m[4] or m[2]}-{m[5]}'
                result+=m[0][first_end:second_start]
                ending=m[0][second_start:]
                if second in known:
                    ending=f'<a href="#ama" class="ax-ref" data-chapter="{known[second]}" data-open="{second}">{ending}</a>'
                return result+ending
            self.out.append(pattern.sub(replace, text))
        def handle_entityref(self,name): self.out.append('&'+name+';')
        def handle_charref(self,name): self.out.append('&#'+name+';')
    parser=Linker(); parser.feed(value); return "".join(parser.out)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ids", nargs="*", default=list(CHAPTERS))
    parser.add_argument("--source", type=Path, default=Path(os.environ.get("AMA_SRC", DEFAULT_SOURCE)))
    parser.add_argument("--output", type=Path, default=ROOT/"ama")
    parser.add_argument("--audit", type=Path, default=ROOT/".local"/"ama-part1"/"audit.json")
    args=parser.parse_args()
    doc=pdf.open(args.source)
    index=json.loads((args.output/"index.json").read_text(encoding="utf-8"))
    chapters, audits, known = {}, [], {}
    for ident in args.ids:
        start,end=CHAPTERS[ident]
        result=dict(id=ident, pages=[], attachments=[], sections=[])
        for number in range(start,end+1):
            page=Page(doc, number)
            content,audit=page.build()
            result["pages"].append(content); result["attachments"].extend(page.attachments)
            result["sections"].extend(page.sections); audits.append(audit)
            print(f'{ident} p{number:02d}: OK ({audit["characters"]} characters; {len(page.grids)} native tables)')
        for attachment in result["attachments"]:
            if attachment["id"] in known: raise ValueError("Repeated attachment ID")
            known[attachment["id"]]=ident
        chapters[ident]=result
    args.output.mkdir(parents=True,exist_ok=True)
    for ident,result in chapters.items():
        for page in result["pages"]: page["html"]=add_links(page["html"],known,ident)
        for attachment in result["attachments"]: attachment["html"]=add_links(attachment["html"],known,ident)
        (args.output/(ident+".json")).write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
        metadata=next(c for c in index["chapters"] if c["id"]==ident)
        metadata["ready"]=True
        metadata["tables"]=sum(a["kind"]=="table" for a in result["attachments"])
        metadata["figures"]=sum(a["kind"]=="figure" for a in result["attachments"])
    (args.output/"index.json").write_text(json.dumps(index,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    args.audit.parent.mkdir(parents=True,exist_ok=True)
    args.audit.write_text(json.dumps(dict(source=str(args.source),pages=audits,objects=known),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f'OK: {len(chapters)} chapters, {len(audits)} pages, {len(known)} linked original objects')


if __name__=="__main__":
    main()
