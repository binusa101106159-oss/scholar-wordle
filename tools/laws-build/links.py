"""Find 附表 mentions in law text and resolve which law's annex they point to.

Rules:
- '附表X' inside law L points to L's own annex X, unless the words right before it name another law
  (by full name or by an abbreviation the law defines with 「（以下簡稱…）」), in which case it points to that law's annex.
- 職業安全衛生設施規則 calls its tables 表一～表三 (no 附).
- Another law that we don't have, or an annex that isn't in the data, gets no link.
"""
import re
from catalog import LAWS

NUMS = '一二三四五六七八九十'
REF = re.compile(rf'附表(?:[{NUMS}]+(?:之[{NUMS}]+)?)?')
LAWNAME = re.compile(r'[一-鿿]{2,}?(?:法|規則|標準|辦法|準則|條例|細則)$')
ARTREF = re.compile(rf'(?:第[{NUMS}百零〇\d\s-]+條(?:第[{NUMS}\d\s]+[項款])*(?:[、及][第]?[{NUMS}百零〇\d\s-]+條?)*)?(?:及其|之|所定之?|規定之?)?$')
SELF = ('本法', '本規則', '本標準', '本辦法', '本準則', '本條例', '本細則')
NAMES = {name: lid for lid, _, name, _ in LAWS}


def aliases(law):
    """Abbreviations a law defines for other laws: 「勞工保險失能給付標準（以下簡稱勞保失能標準）」"""
    out = {}
    for text in all_text(law):
        for m in re.finditer(r'（以下簡稱([^）]{2,12})）', text):
            before = text[:m.start()]
            for name, lid in NAMES.items():
                if before.endswith(name):
                    out[m.group(1)] = lid
    return out


def all_text(law):
    yield from law['notes']
    for it in law['items']:
        if it['t'] != 'art': continue
        for p in it['paras']:
            for l in p['lines']:
                if 'text' in l: yield l['text']


def resolve(text, law, annex_index, alias):
    """Return [[start, end, annex_id], ...] for clickable 附表 mentions in text."""
    own = law['id']
    out = []
    pattern = REF if own != 's07' else re.compile(rf'(?<![附下列照對度])表[一二三](?![{NUMS}])')
    for m in pattern.finditer(text):
        label = m.group()
        target = own
        before = text[max(0, m.start() - 40):m.start()]
        stem = ARTREF.sub('', before) if ARTREF.search(before) else before
        if not stem.endswith(SELF):
            hit = None
            for name, lid in list(NAMES.items()) + list(alias.items()):
                if stem.endswith(name) and (hit is None or len(name) > len(hit[0])): hit = (name, lid)
            if hit: target = hit[1]
            elif LAWNAME.search(stem[-14:]) and not stem.endswith(('附表', '表')):
                # names a law we don't have
                m2 = LAWNAME.search(stem[-14:])
                if m2 and m2.group() not in ('本法',): continue
        if own == 's07':
            label = m.group()
        annexes = annex_index.get(target, [])
        a = next((a for a in annexes if a['label'] == label), None)
        if a is None and label == '附表' and len(annexes) == 1:
            a = annexes[0]
        if a: out.append([m.start(), m.end(), a['id']])
    return out
