"""Publish tracked public assets only; never include local drafts, tests or tooling."""
from pathlib import Path
import shutil, subprocess, hashlib, re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
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


# Give changed assets new URLs so browsers/CDNs cannot reuse older code or CSS.
def version_asset(match):
    before, quote, value = match.groups()
    parts = urlsplit(value)
    if parts.scheme or parts.netloc or not parts.path or parts.path.startswith(('/', '#')):
        return match.group(0)
    asset = out / parts.path
    if not asset.is_file() or asset.suffix not in {'.js', '.css'}:
        return match.group(0)
    version = hashlib.sha256(asset.read_bytes()).hexdigest()[:16]
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != 'v'] + [('v', version)]
    return before + quote + urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)) + quote
for html_file in out.glob('*.html'):
    text = html_file.read_text(encoding='utf8')
    text = re.sub(r"""((?:src|href|data-cloud-src)=)(["'])([^"']+)\2""", version_asset, text)
    html_file.write_text(text, encoding='utf8')
