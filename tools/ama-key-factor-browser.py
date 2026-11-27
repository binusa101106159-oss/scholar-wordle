"""AMA: the key-factor row of each class grid is marked (gold band + KEY FACTOR label drawn by CSS), from the
table's own «Key factor» footnote or, where there is none, the chapter rule (Ch 5 objective tests; Ch 8, 10 history).
The table text itself is unchanged."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
EXPECT={'Table 4-5':'OBJECTIVE TEST RESULTS','Table 5-4':'OBJECTIVE TESTS','Table 6-4':'HISTORY','Table 6-10':'PHYSICAL FINDINGS','Table 7-5':'OBJECTIVE FINDINGS',
 'Table 8-2':'HISTORY','Table 9-6':'OBJECTIVE FINDINGS','Table 10-12':'HISTORY','Table 10-14':'HISTORY','Table 11-4':'HISTORY','Table 11-6':'HISTORY','Table 11-8':'VOICE/SPEECH'}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',nargs='+',default=['chromium','firefox','webkit']);parser.add_argument('--shots',default=str(ROOT/'.local/ama-key'));args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 out=Path(args.shots);out.mkdir(parents=True,exist_ok=True)
 try:
  with sync_playwright()as p:
   for engine in args.engines:
    b=getattr(p,engine).launch()
    page=b.new_page(viewport={'width':1440,'height':900},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://www.gstatic.com/**',lambda r:r.abort())
    page.goto(base+'#ama');page.wait_for_function("!!(window.ScholarAMA&&ScholarAMA.markKeyFactors)")
    res=page.evaluate("""async()=>{const out={};for(let c=1;c<=17;c++){const d=await (await fetch('ama/c'+String(c).padStart(2,'0')+'.json')).json();
     for(const a of d.attachments){if(!/CLASS 0|CLASS 1/.test(a.html||''))continue;const h=document.createElement('div');h.innerHTML=a.html;const before=h.textContent;ScholarAMA.markKeyFactors(h,a.label);
      out[a.label]={rows:[...h.querySelectorAll('tr.ax-key-row')].map(r=>r.cells[0].textContent.replace(/\\s+/g,' ').trim()),same:h.textContent===before};}}return out;}""")
    for label,want in EXPECT.items():
     rows=res[label]['rows'];assert len(rows)>=1 and rows[0].startswith(want),(label,rows)
    assert all(v['same'] for v in res.values())
    # every grid with a HISTORY / PHYSICAL / OBJECTIVE row in chapters 4–11 has its key factor marked
    for label,v in res.items():
     ch=int(label.split()[1].split('-')[0])
     if 4<=ch<=11 and label not in ('Table 4-4','Table 5-3','Table 6-3','Table 7-1','Table 9-4','Table 10-1'):assert v['rows'],label
    # shown in the table window: gold band and the KEY FACTOR label
    page.evaluate("""(()=>{const h=document.createElement('div');document.body.append(h);h.id='kf-probe';})()""")
    page.evaluate("""async()=>{const d=await (await fetch('ama/c05.json')).json();const a=d.attachments.find(x=>x.label==='Table 5-4');const h=document.getElementById('kf-probe');h.className='ax-dialog-body';h.innerHTML=a.html;ScholarAMA.markKeyFactors(h,a.label);}""")
    lab=page.evaluate("getComputedStyle(document.querySelector('#kf-probe td.ax-key-cell'),'::after').content");assert lab=='"KEY FACTOR"',lab
    assert not errors,errors;page.close();print(engine,'key factor rows from footnotes / chapter rule for 5-4, 8-2, 10-14 / text unchanged / label shown PASS',flush=True)
    b.close()
 finally:server.shutdown()
if __name__=='__main__':main()
