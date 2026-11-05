"""Reuse byte-stable published assets when regenerated PNG pixels are identical.

Usage: python reuse_images.py <staged-guides> <previous-guides>
Only image src references change; source text, geometry and image pixels do not.
"""
import hashlib,json,shutil,sys
from pathlib import Path
from PIL import Image

def pixels(path):
    with Image.open(path) as image:
        image=image.convert('RGBA')
        return image.size,hashlib.sha256(image.tobytes()).digest()

def reuse(staged,previous):
    staged,previous=Path(staged),Path(previous)
    known={}
    for path in sorted((previous/'attach/img').glob('*')):
        if path.is_file():known.setdefault(pixels(path),path)
    aliases={}
    for path in (staged/'attach/img').glob('*'):
        if not path.is_file():continue
        match=known.get(pixels(path))
        if match and path.name!=match.name:aliases[path.name]=match
    changed=0
    def visit(value):
        nonlocal changed
        if isinstance(value,dict):
            if value.get('src') in aliases:
                match=aliases[value['src']];value['src']=match.name;changed+=1
                dest=staged/'attach/img'/match.name
                if not dest.exists():shutil.copy2(match,dest)
            for item in value.values():visit(item)
        elif isinstance(value,list):
            for item in value:visit(item)
    for folder in ['text','attach']:
        for path in (staged/folder).glob('*.json'):
            value=json.loads(path.read_text(encoding='utf8'));before=changed;visit(value)
            if changed>before:path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    print('Pixel-identical image references reused:',changed)
    return changed

if __name__=='__main__':reuse(sys.argv[1],sys.argv[2])
