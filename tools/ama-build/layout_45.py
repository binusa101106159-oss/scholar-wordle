"""Source coordinate hints for Chapters 4–5; no transcribed source text."""
from types import SimpleNamespace

TABLES = {
 48: [('4-1',(71,519,292,733),'keyed',(71,548,291,687))],
 49: [('4-2',(72,74,542,451),'positioned',(73.08,99.125,541,417.125)),
      ('4-3',(72,465,542,722),'coordinates',(73.087,490,541,700))],
 50: [('4-4',(71,573,542,723),'method',(72,586.5,540,722))],
 53: [('4-5',(71,72,542,748),'composite',None)],
 55: [('4-6',(71,72,542,730),'composite',None)],
 59: [('4-7',(70,59,542,676),'composite',None)],
 61: [('4-8',(71,59,542,722),'composite',None)],
 64: [('4-9',(71,59,542,683),'composite',None)],
 66: [('4-10',(71,59,291,168),'grid',(71,88,278,153))],
 67: [('4-11',(71,59,542,653),'composite',None)],
 69: [('4-12',(71,185,542,707),'composite',None)],
 70: [('4-13',(71,59,542,575),'composite',None)],
 72: [('4-14',(71,59,542,588),'composite',None)],
 74: [('4-15',(71,164,556,767),'coordinates',(72.525,180.833,555,764.502))],
 75: [('4-15-next',(71,180,541,767),'coordinates',(72.602,180.833,539.107,764.502))],
 79: [('5-1',(71,59,292,270),'grid',(75,87.5,291,230))],
 85: [('5-2',(320,558,541,731),'grid',(320,597,538,705))],
 86: [('5-3',(71,583,542,733),'method',(72,597,540,732))],
 88: [('5-4',(71,71,542,738),'composite',None)],
 90: [('5-5',(71,59,542,577),'composite',None)],
 92: [('5-6',(71,542,292,734),'grid',(71,582,289,719))],
 96: [('5-7',(71,181,556,422),'coordinates',(72.5,208.332,555,419.832))],
 97: [('5-7-next',(71,207,542,422),'coordinates',(72,208.332,540,419.832))],
}
SPREADS = [('c04','4-15',74,75),('c05','5-7',96,97)]
CARDIAC_ROWS = [180.833,213.833,302.833,359.083,415.333,463.668,
                524.168,575.168,627.168,716.168,764.502]
LUNG_ROWS = [208.332,231.832,301.832,344.332,377.332,419.832]
COORDINATES = {
 (50,'4-4'): ([72,150,228,306,384,462,540],[648.115,671.615,721.015]),
 (86,'5-3'): ([72,150,228,306,384,462,540],[658.326,681.826,731.226]),
 (74,'4-15'): ([72.525,134.107,266.455,364.479,555],CARDIAC_ROWS),
 (75,'4-15-next'): ([72.602,254.244,468.650,539.107],CARDIAC_ROWS),
 (96,'5-7'): ([72.5,165.746,296.489,411.967,555],LUNG_ROWS),
 (97,'5-7-next'): ([72,207.948,363.035,540],LUNG_ROWS),
 (49,'4-3'): ([73.087,99.5,126.75]+[158+32*i for i in range(12)]+[541],
               [490,504,518,540]+[560+14*i for i in range(11)]),
 (49,'4-2'): ([73.08,158.66,541], [99.125,113.125,127.125,139.125,150.125,
      163.125,173.125,184.125,197.125,207.125,218.125,231.125,241.125,
      252.125,265.125,275.125,286.125,297.125,300.125,314.125,328.125,
      352.125,375.125,390.125,404.125,417.125]),
}

def coordinate_grid(number, ident):
    xs,ys=COORDINATES[number,ident]
    cells=[[(x0,y0,x1,y1) for x0,x1 in zip(xs,xs[1:])] for y0,y1 in zip(ys,ys[1:])]
    if ident=='4-3':
        # The two weights and thirteen workloads share a two-part heading.
        cells[0]=[(xs[0],ys[0],xs[2],ys[1]),(xs[2],ys[0],xs[-1],ys[1])]
    return SimpleNamespace(rows=[SimpleNamespace(cells=row) for row in cells],
                           bbox=(xs[0],ys[0],xs[-1],ys[-1]))

def keyed_grid(table, chars, inside):
    """Join unruled text continuations that have no new first-column key."""
    cells=[c for row in table.rows for c in row.cells if c]
    xs=sorted(set(round(c[i],3) for c in cells for i in (0,2)))
    ys=sorted(set(round(c[i],3) for c in cells for i in (1,3)))
    cuts=[ys[0]]
    for top,bottom in zip(ys[1:-1],ys[2:]):
        if any(c['text'].strip() and inside(c,(xs[0],top,xs[1],bottom)) for c in chars): cuts.append(top)
    cuts.append(ys[-1])
    return SimpleNamespace(rows=[SimpleNamespace(cells=[(a,t,b,u) for a,b in zip(xs,xs[1:])])
                                  for t,u in zip(cuts,cuts[1:])],bbox=table.bbox)
