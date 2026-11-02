"""Only original source pictures; raster lettering is native selectable text.

Pixel boxes below were read from the two original picture objects at native
resolution. They are not OCR output, inferred anatomy, or new picture content.
"""
from functools import lru_cache
from io import BytesIO
from PIL import Image,ImageDraw
import pymupdf as pdf
import base64
import re
import xml.etree.ElementTree as ET

# Source pixel coordinates, wording and font size in the picture itself.
LABELS={
 546:[('Dorsiflexion',(103,134,192,151),16),('Plantar flexion',(68,424,174,441),16)],
 548:[('Neutral',(305,18,359,34),16),('Outward',(92,201,155,218),16),
      ('rotation',(92,220,151,237),16),('Inward',(553,201,605,218),16),
      ('rotation',(553,220,612,237),16),('90°',(53,456,79,472),16),('90°',(595,456,621,472),16)]}

def label_characters(number,block):
    x0,y0,x1,y1=block['bbox'];sx=(x1-x0)/block['width'];sy=(y1-y0)/block['height']
    font=pdf.Font('helv');out=[]
    for li,(text,box,size) in enumerate(LABELS.get(number,[])):
        a,b,c,d=box;widths=[font.text_length(ch,fontsize=size) for ch in text];total=sum(widths);left=a
        for ci,(ch,width) in enumerate(zip(text,widths)):
            right=left+(c-a)*width/total
            out.append(dict(text=ch,c=ch,bbox=(x0+left*sx,y0+b*sy,x0+right*sx,y0+d*sy),
                origin=(x0+left*sx,y0+(b+size)*sy),font='Arial',size=size*sy,flags=0,
                uid=('raster',block['number'],li,ci),line=('raster',block['number'],li),span=('raster',block['number'],li),block=('raster',block['number'])))
            left=right
    return out

@lru_cache(maxsize=16)
def picture(pixels,number):
    im=Image.open(BytesIO(pixels))
    if number in LABELS:
        im=im.convert('RGB');draw=ImageDraw.Draw(im)
        for _,(a,b,c,d),_ in LABELS[number]:draw.rectangle((a-2,b-2,c+2,d+2),fill='white')
    out=BytesIO();im.save(out,format='PNG');return out.getvalue()

@lru_cache(maxsize=8)
def source_svg(source,number,box,owner,pixels=b''):
    """Retain the PDF's stencil masks, clipping and actual paint order."""
    ET.register_namespace('','http://www.w3.org/2000/svg')
    ET.register_namespace('xlink','http://www.w3.org/1999/xlink')
    root=ET.fromstring(source)
    for parent in root.iter():
        for child in list(parent):
            if child.tag.rsplit('}',1)[-1]=='text':parent.remove(child)
    href='{http://www.w3.org/1999/xlink}href'
    if pixels:
        cleaned=picture(pixels,number)
        for el in root.iter():
            if el.tag.rsplit('}',1)[-1]=='image':el.set(href,'data:image/png;base64,'+base64.b64encode(cleaned).decode('ascii'))
    ids={el.get('id'):owner+'-'+el.get('id') for el in root.iter() if el.get('id')}
    for el in root.iter():
        for key,val in list(el.attrib.items()):
            if key=='id':el.set(key,ids[val])
            elif val.startswith('#') and val[1:] in ids:el.set(key,'#'+ids[val[1:]])
            elif 'url(#' in val:el.set(key,re.sub(r'url\(#([^)]*)\)',lambda m:'url(#'+ids[m[1]]+')',val))
    a,b,c,d=box
    root.set('viewBox',f'{a} {b} {c-a} {d-b}')
    root.set('width',str((c-a)*1.8));root.set('height',str((d-b)*1.8));root.set('class','ax-vector')
    root.set('role','img');root.set('aria-label','原書圖形')
    return ET.tostring(root,encoding='unicode')
