"""Recover closed calculation boxes from original PDF strokes, not text alignment."""
from types import SimpleNamespace

def calculation_grid(page,previous):
    x0,y0,x1,y1=previous;candidates=[]
    for drawing in page.get_drawings():
        r=drawing['rect']
        if 100<r.width<300 and 40<r.height<400 and r.x0<=x0+8 and r.y0<=y0+8 and r.x1>=x1-8 and r.y1>=y1-8:
            lines=[(float(a.x),float(a.y),float(b.x),float(b.y)) for op,a,b,*_ in drawing['items'] if op=='l'] if all(i[0]=='l' for i in drawing['items']) else []
            if lines:candidates.append((r.width*r.height,lines))
    if not candidates:return None
    lines=min(candidates,key=lambda x:x[0])[1]
    vs=[(a,min(b,d),max(b,d))for a,b,c,d in lines if abs(a-c)<.1]
    hs=[(b,min(a,c),max(a,c))for a,b,c,d in lines if abs(b-d)<.1]
    xs=sorted(set(round(x,3)for x,_,_ in vs))
    if len(xs)<2:return None
    ys=[]
    for y in sorted(set(round(y,3)for y,_,_ in hs)):
        spans=sorted((a,b)for yy,a,b in hs if abs(yy-y)<.1);end=xs[0]
        for a,b in spans:
            if a>end+1:break
            end=max(end,b)
        if end>=xs[-1]-.5:ys.append(y)
    if len(ys)<3:return None
    rows=[]
    for top,bottom in zip(ys,ys[1:]):
        mid=(top+bottom)/2;cuts=[xs[0]]+[x for x in xs[1:-1] if any(abs(xx-x)<.1 and a<=mid<=b for xx,a,b in vs)]+[xs[-1]]
        rows.append(SimpleNamespace(cells=[(a,top,b,bottom)for a,b in zip(cuts,cuts[1:])]))
    return SimpleNamespace(bbox=(xs[0],ys[0],xs[-1],ys[-1]),rows=rows)
