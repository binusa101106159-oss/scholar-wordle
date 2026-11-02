"""Native label read from Figure 15-19's original picture; retain stencil ink."""
from functools import lru_cache
from io import BytesIO
import base64
import xml.etree.ElementTree as ET
from PIL import Image,ImageDraw
import pymupdf as pdf
from raster_16 import source_svg

LABEL=(1080,1689,1252,1762)

def label_characters(block):
    if (block['width'],block['height'])!=(2369,3359):return []
    x0,y0,x1,y1=block['bbox'];sx=(x1-x0)/2369;sy=(y1-y0)/3359
    text='cm';a,b,c,d=LABEL;f=pdf.Font('helv');widths=[f.text_length(ch,fontsize=100) for ch in text];left=a;out=[]
    for i,(ch,width) in enumerate(zip(text,widths)):
        right=left+(c-a)*width/sum(widths)
        out.append(dict(text=ch,c=ch,bbox=(x0+left*sx,y0+b*sy,x0+right*sx,y0+d*sy),origin=(x0+left*sx,y0+d*sy),font='Arial',size=100*sy,flags=0,uid=('raster',block['number'],0,i),line=('raster',block['number'],0),span=('raster',block['number'],0),block=('raster',block['number'])))
        left=right
    return out

@lru_cache(maxsize=8)
def artwork(source,number,box,owner):
    value=source_svg(source,number,box,owner)
    if number!=467:return value
    root=ET.fromstring(value);href='{http://www.w3.org/1999/xlink}href'
    for el in root.iter():
        if el.tag.rsplit('}',1)[-1]!='image' or (el.get('width'),el.get('height'))!=('2369','3359'):continue
        im=Image.open(BytesIO(base64.b64decode(el.get(href).split(',')[1]))).convert('L')
        # Zero clears only the two original lettering components in the stencil.
        draw=ImageDraw.Draw(im)
        for a,b,c,d in ((1080,1689,1141,1762),(1155,1689,1252,1760)):draw.rectangle((a-1,b-1,c,d),fill=0)
        out=BytesIO();im.save(out,format='PNG');el.set(href,'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode('ascii'))
    return ET.tostring(root,encoding='unicode')
