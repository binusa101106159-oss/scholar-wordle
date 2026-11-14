"""Publish tracked public assets only; never include local drafts, tests or tooling."""
from pathlib import Path
import shutil, subprocess
root=Path(__file__).resolve().parents[1]
out=root/'.local/pages-site'
out.mkdir(parents=True,exist_ok=True)
allowed={'.html','.js','.css','.json','.gz','.png','.jpg','.jpeg','.svg','.webp','.gif','.ico','.woff','.woff2','.ttf','.webmanifest'}
for name in subprocess.check_output(['git','ls-files','-z'],cwd=root).decode('utf-8').split('\0'):
    if not name:continue
    p=Path(name)
    if p.parts[0] in {'tools','tests','.github'} or (p.suffix.lower() not in allowed and name!='.nojekyll'):continue
    if p.name in {'package.json','package-lock.json','tailwind.config.cjs'}:continue
    target=out/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/p,target)
print('Public assets prepared')
