"""Exercise delayed account hydration with synthetic data, or real guest SDK boot."""
from pathlib import Path
import argparse,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
APP="export const getApps=()=>[];export const initializeApp=()=>({});export const getApp=()=>({});"
AUTH="""
export const browserLocalPersistence={},browserSessionPersistence={},inMemoryPersistence={},browserPopupRedirectResolver={};
export const initializeAuth=()=>window.testAuth={currentUser:null};
export const onAuthStateChanged=(auth,callback)=>{window.testAuthCallback=callback;queueMicrotask(()=>callback(null));};
export class GoogleAuthProvider{};
export const signInWithPopup=async auth=>{auth.currentUser={uid:'synthetic-owner',email:'binusa101106159@gmail.com',emailVerified:true};window.testAuthCallback(auth.currentUser);return {user:auth.currentUser};};
export const signOut=async auth=>{auth.currentUser=null;window.testAuthCallback(null);};
"""
FIRESTORE="""
export const memoryLocalCache=()=>({});export const initializeFirestore=()=>({});export const collection=()=>({});export const doc=(state,id)=>({id});export const serverTimestamp=()=>0;
export const getDocsFromServer=()=>{window.testReads=(window.testReads||0)+1;return new Promise(resolve=>window.releaseCloudRead=()=>resolve({docs:[]}));};
export const enableNetwork=async()=>{window.testNetworkNudges=(window.testNetworkNudges||0)+1;};
export const onSnapshot=(state,opts,callback)=>{window.testSnapshotCallback=callback;return ()=>window.testStops=(window.testStops||0)+1;};
export const runTransaction=async(db,work)=>work({get:async()=>({exists:()=>false}),set(){}});
"""
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--engines',default='chromium,firefox,webkit');parser.add_argument('--url');parser.add_argument('--real',action='store_true');parser.add_argument('--width',type=int,default=1280);parser.add_argument('--blocked-storage',action='store_true');args=parser.parse_args()
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=args.url or f'http://127.0.0.1:{server.server_port}/'
 try:
  with sync_playwright()as p:
   for engine in args.engines.split(','):
    browser=getattr(p,engine).launch();context=browser.new_context(viewport={'width':args.width,'height':950},service_workers='block');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));navigations=[];page.on('framenavigated',lambda frame:navigations.append(frame.url)if frame==page.main_frame else None)
    if args.blocked_storage:page.add_init_script("for(const name of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(window,name,{get(){throw new DOMException('blocked','SecurityError')}});")
    if not args.real:
     def sdk(route):
      name=route.request.url.split('/')[-1];route.fulfill(content_type='text/javascript',body={'firebase-app.js':APP,'firebase-auth.js':AUTH,'firebase-firestore.js':FIRESTORE}[name])
     page.route('https://www.gstatic.com/firebasejs/**',sdk)
    page.goto(base.rstrip('/')+'/#calculator');page.locator('#cl-input').wait_for();page.wait_for_function("document.getElementById('cloud-status').textContent==='Not signed in · not saved'")
    if args.real:
     assert page.locator('#cloud-signin').is_enabled();assert not page.locator('#cloud-error').is_visible();print(engine,'real Firebase guest startup / sign-in ready PASS',flush=True)
    else:
     box=page.locator('#cl-input');box.fill('123+456');page.locator('#cloud-signin').click();page.wait_for_function('window.testReads===1');assert not page.locator('#cloud-signin').is_visible();assert 'Signed in'in page.locator('#cloud-status').inner_text()
     page.wait_for_timeout(12300);assert len(navigations)==1;assert page.evaluate('ScholarSync.status().user')is None;assert box.input_value()=='123+456';assert 'timed out'not in page.locator('#cloud-error').inner_text()
     for _ in range(3):page.locator('#cloud-retry').click()
     assert page.evaluate('testReads')==1;assert page.evaluate('testNetworkNudges')==3
     box.fill('987+654');page.evaluate('releaseCloudRead()');page.wait_for_function('ScholarSync.status().user?.uid==="synthetic-owner"');assert box.input_value()=='987+654';assert page.evaluate('JSON.parse(ScholarStorage.getItem("scholar-calculator-v1")).input')=='987+654';assert len(navigations)==1
     page.evaluate('testAuthCallback(testAuth.currentUser)');page.wait_for_timeout(100);assert page.evaluate('testReads')==1
     page.locator('#cl-copy').focus();page.evaluate('ScholarSync.flush()');page.wait_for_function('ScholarSync.status().pending===0');page.evaluate('ScholarSync.error("offline");testSnapshotCallback({metadata:{fromCache:false,hasPendingWrites:false},docChanges:()=>[]})');page.wait_for_function('ScholarSync.status().phase==="synced"');assert not page.locator('#cloud-bar').is_visible();assert box.input_value()=='987+654';assert not errors,errors
     print(engine,'slow account / late success / Retry coalescing / no reload / draft retention / listener recovery PASS',flush=True)
    assert not errors,errors;context.close();browser.close()
 finally:server.shutdown()
if __name__=='__main__':main()
