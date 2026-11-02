"""Labels read from the original raster Figure 12-11 at 300% zoom.
Coordinates use the extracted 980 x 1416 source pixels. No calculated values.
The printed left 30-2 grid has 8x/8x, while the right has 6x/6x.
"""
LABELS = []
def label(text,x,y,w,h,size):
    LABELS.append(dict(text=text,box=(x,y,x+w,y+h),size=size))
label('RIGHT EYE',175,5,140,28,24)
label('LEFT EYE',670,5,115,28,24)
for text,y in [('Humphrey 10-2.',47),('Humphrey 30-2.',499),('Humphrey 60-4',953)]:label(text,0,y,183,30,24)
for y,starts,vals in [(107,[120,600],['-9','-7','-5','-3','-1','+1','+3','+5','+7','+9']), (552,[108,593],['-27','-21','-15','-9','-3','+3','+9','+15','+21','+27']), (1008,[105,590],['-54','-42','-30','-18','-6','+6','+18','+30','+42','+54'])]:
    for start in starts:
        for i,text in enumerate(vals):label(text,start+i*34.5,y,18 if y==107 else 24,14,12)
for offset in [0,480]:
    for row,y in enumerate([266,306]):
        for x in [252+offset,287+offset]:label('2x' if row==0 else '3x',x,y,18,14,12)
for col,offset in enumerate([0,484]):
    for row,(y,vals) in enumerate([(683,['2x']*4),(717,['2x','4x','4x','2x']),(752,['3x','8x' if col==0 else '6x','8x' if col==0 else '6x','3x']),(786,['3x']*4)]):
        for i,text in enumerate(vals):label(text,217+offset+i*32,y,18,15,12)
for x in [215,699]:
    label('Use 30-2 plot to assign',x,1170,133,18,12)
    label('70 additional points',x+8,1190,119,18,12)


def artwork_without_lettering(source):
    """Remove only small connected lettering components, preserving grid strokes."""
    from io import BytesIO
    from PIL import Image,ImageDraw
    im=Image.open(BytesIO(source)).convert('RGB');gray=im.convert('L');w,h=im.size
    ink=bytearray(1 if v<225 else 0 for v in gray.tobytes());draw=ImageDraw.Draw(im)
    regions=[(100,102,950,124),(100,546,950,571),(100,1002,955,1026)]
    regions += [(a-6,t-5,c+6,u+5) for q in LABELS for a,t,c,u in [q['box']] if 250<t<330 or 680<t<810 or 1160<t<1220]
    for start in range(w*h):
        if not ink[start]:continue
        ink[start]=0;stack=[start];a=c=start%w;t=u=start//w
        while stack:
            at=stack.pop();x=at%w;y=at//w;a=min(a,x);c=max(c,x);t=min(t,y);u=max(u,y)
            for nxt in (at-1 if x else -1,at+1 if x+1<w else -1,at-w,at+w):
                if 0<=nxt<w*h and ink[nxt]:ink[nxt]=0;stack.append(nxt)
        if c-a<180 and u-t<35 and any(x0<=(a+c)/2<=x1 and y0<=(t+u)/2<=y1 for x0,y0,x1,y1 in regions):
            draw.rectangle((a,t,c,u),fill='white')
    for box in [(0,0,980,36),(0,43,190,80),(0,495,190,534),(0,950,190,989)]:draw.rectangle(box,fill='white')
    out=BytesIO();im.save(out,format='PNG',optimize=True);return out.getvalue()
