"""Assemble site data: laws/index.json, laws/text/<id>.json, laws/annex/<id>.json (+ img/)."""
import json, os, shutil, sys, re
from catalog import LAWS, TIERS
from links import resolve, aliases

BUILD = os.path.dirname(os.path.abspath(__file__))
OUT_LAWS = os.path.join(BUILD, 'out/laws')
OUT_ANNEX = os.path.join(BUILD, 'out/annex')


def main(repo, tiers):
    dest = os.path.join(repo, 'laws')
    for sub in ('text', 'annex'):
        shutil.rmtree(os.path.join(dest, sub), ignore_errors=True)
    for sub in ('text', 'annex', 'annex/img'):
        os.makedirs(os.path.join(dest, sub), exist_ok=True)
    annex_index = json.load(open(os.path.join(OUT_ANNEX, 'index.json'), encoding='utf-8'))
    catalog = []
    stats = {}
    for lid, tier, name, _ in LAWS:
        if tier not in tiers: continue
        law = json.load(open(os.path.join(OUT_LAWS, lid + '.json'), encoding='utf-8'))
        alias = aliases(law)
        nlinks = 0
        for it in law['items']:
            if it['t'] != 'art': continue
            for p in it['paras']:
                for l in p['lines']:
                    if 'text' in l:
                        lk = resolve(l['text'], law, annex_index, alias)
                        if lk: l['links'] = lk; nlinks += len(lk)
        law['notesLinks'] = [resolve(n, law, annex_index, alias) for n in law['notes']]
        nlinks += sum(len(x) for x in law['notesLinks'])
        annexes = []
        for a in annex_index.get(lid, []):
            data = json.load(open(os.path.join(OUT_ANNEX, a['id'] + '.json'), encoding='utf-8'))
            title = a['title'] or next((b['text'] for b in data['blocks'] if b['t'] == 'p' and b['text'] not in (a['label'],)), '')
            title = re.sub(r'^' + a['label'] + r'\s*', '', title).strip()
            data['title'] = title
            json.dump(data, open(os.path.join(dest, 'annex', a['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            for f in set(re.findall(r'"src": ?"([^"]+)"', json.dumps(data, ensure_ascii=False))):
                shutil.copy(os.path.join(OUT_ANNEX, 'img', f), os.path.join(dest, 'annex/img', f))
            annexes.append(dict(id=a['id'], label=a['label'], title=title))
        law['annexes'] = annexes
        json.dump(law, open(os.path.join(dest, 'text', lid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        arts = sum(1 for it in law['items'] if it['t'] == 'art')
        catalog.append(dict(id=lid, tier=tier, name=name, dateLabel=law['dateLabel'], date=law['date'],
                            status=law['status'], articles=arts, annexes=annexes))
        stats[lid] = nlinks
    index = dict(tiers=[dict(id=t, name=n) for t, n in TIERS if t in tiers], laws=catalog)
    json.dump(index, open(os.path.join(dest, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for lid, n in stats.items(): print(lid, 'links:', n)


if __name__ == '__main__':
    main(sys.argv[1], set(sys.argv[2:]))
