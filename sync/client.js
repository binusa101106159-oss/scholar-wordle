import {firebaseConfig} from './firebase-config.js';

const sync = window.ScholarSync;
let auth, db, A, F, stop, initialized = false, started = false;
let preparedApps, signingIn = false;
const ownerEmail = 'binusa101106159@gmail.com';
async function timed(promise) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cloud connection timed out. Public reading is available; retry to reconnect.')),8000);})]); }
  finally { clearTimeout(timer); }
}
const docID = id => btoa(unescape(encodeURIComponent(id))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function mount() {
  const bar = document.createElement('aside');
  bar.id = 'cloud-bar'; bar.setAttribute('aria-label', 'Cloud sync');
  bar.innerHTML = '<span id="cloud-status" role="status" aria-live="polite">Connecting…</span><button id="cloud-signin" type="button">Sign in</button><button id="cloud-retry" type="button" hidden>Retry</button><p id="cloud-error" role="alert" hidden></p><details id="cloud-account" hidden><summary>Account</summary><div id="cloud-account-menu"><p id="cloud-email"></p><button id="cloud-signout" type="button">Sign out</button></div></details>';
  document.body.append(bar);
  const by = id => document.getElementById(id);
  const render = () => {
    const state = sync.status();bar.dataset.state = state.phase;
    bar.hidden = state.phase === 'synced' && Boolean(state.user) && !state.pending && !state.error && !signingIn;
    by('cloud-status').textContent = state.phase === 'loading' ? 'Connecting…' : state.phase === 'guest' ? 'Not signed in · not saved' : state.phase === 'error' ? 'Not synced · retry' : state.pending ? (state.background?'Saving position…':'Syncing…') : 'Synced';
    by('cloud-status').title = state.error || (state.user ? state.user.email : 'Sign in to save across devices. Guest changes last only for this visit.');
    by('cloud-signin').hidden = Boolean(state.user);by('cloud-account').hidden = !state.user;
    by('cloud-signin').disabled = signingIn;
    by('cloud-signin').textContent = signingIn ? 'Signing in…' : 'Sign in';
    if (signingIn) by('cloud-status').textContent = 'Continue in the Google sign-in window';
    by('cloud-error').hidden = !state.error || signingIn;
    by('cloud-error').textContent = state.error || '';
    by('cloud-signout').disabled = state.pending > 0;
    by('cloud-email').textContent = state.user?.email || '';
    by('cloud-retry').hidden = state.phase !== 'error';
  };
  window.addEventListener('scholar-sync-status', render); render();
  by('cloud-signin').onclick = async () => {
    if (signingIn) return;
    signingIn = true; render();
    try {
      if (!auth) throw Error('Google sign-in has not loaded. Wait a moment, then retry. If this continues, reload and check your connection.');
      // Call directly from the click handler to preserve Safari's user gesture.
      await A.signInWithPopup(auth, new A.GoogleAuthProvider());
    } catch (error) {
      const messages = {
        'auth/popup-blocked': 'The sign-in window was blocked. In Safari: Settings → Websites → Pop-up Windows → Allow for this site. Then press Sign in again.',
        'auth/popup-closed-by-user': 'The Google sign-in window closed before sign-in finished. Press Sign in to try again.',
        'auth/cancelled-popup-request': 'Another sign-in window is already open. Complete sign-in there, or close it and retry.',
        'auth/network-request-failed': 'Google sign-in could not connect. Check your connection and retry.',
        'auth/unauthorized-domain': 'This website address is not authorized for Google sign-in. Please report this message.'
      };
      sync.error(messages[error.code] || error.message || 'Google sign-in failed. Please retry.');
    } finally { signingIn = false; render(); }
  };
  by('cloud-signout').onclick = async () => {
    try { if (sync.status().pending) await sync.flush();await A.signOut(auth); }
    catch (error) { sync.error(error.message); }
  };
  by('cloud-retry').onclick = () => sync.status().pending ? sync.flush().catch(() => {}) : location.reload();
}
function prepareApps() {
  const nodes = [...document.querySelectorAll('script[data-cloud-src], script[data-cloud-inline]')];
  return Promise.all(nodes.map(async node => {
    if (!node.dataset.cloudSrc) return node.textContent;
    const response = await fetch(new URL(node.dataset.cloudSrc, location.href));
    if (!response.ok) throw Error('Could not load '+node.dataset.cloudSrc);
    return response.text();
  })).then(sources=>({nodes,sources}));
}
async function startApps() {
  if (started) return;started = true;
  // Files download alongside auth/cloud reads; execution still waits for hydration.
  const {nodes,sources}=await preparedApps;
  for (let i=0;i<nodes.length;i++) {
    if(nodes[i].hasAttribute('data-cloud-seed')&&sync.status().user)continue;
    const script = document.createElement('script');
    script.textContent = sources[i] + '\n//# sourceURL=' + (nodes[i].dataset.cloudSrc || 'scholar-inline-'+i+'.js');
    document.body.append(script);
  }
  window.dispatchEvent(new Event('scholar-apps-ready'));
}
function readSnapshot(snapshot) {
  const entries = new Map();
  for (const item of snapshot.docs) {
    const id = decodeURIComponent(escape(atob(item.id.replaceAll('-','+').replaceAll('_','/'))));
    const key = JSON.parse(id)[0];if (!sync.allowed(key)) continue;
    const data = item.data();const envelope = JSON.parse(data.value);
    if (typeof envelope.data !== 'string' && envelope.data !== null) throw Error('Unrecognized cloud state');
    entries.set(id, envelope.data);
  }
  return entries;
}
async function accountChanged(user) {
  if (stop) { stop();stop = null; }
  if (user && (!user.emailVerified || user.email !== ownerEmail)) {
    await A.signOut(auth);sync.error('This private site is restricted to its owner account.');return;
  }
  const previous = sync.status().user?.uid;
  // Clear displayed personal data immediately during sign-out/account changes.
  if (initialized && previous !== user?.uid) { document.body.hidden=true;location.reload();return; }
  if (!user) { sync.connect(null, null);initialized = true;await startApps();return; }
  try {
    const state = F.collection(db, 'users', user.uid, 'state');
    const snapshot = await timed(F.getDocsFromServer(state));
    const adapter = {
      async commit(op) {
        return (await this.commitMany([op]))[0];
      },
      async commitMany(ops) {
        const refs=ops.map(op=>F.doc(state,docID(op.id)));
        return F.runTransaction(db, async transaction => {
          const current=await Promise.all(refs.map(ref=>transaction.get(ref)));
          const next=ops.map((op,i)=>{
            const data=current[i].exists()?current[i].data():null,remote=data?JSON.parse(data.value).data:null;
            const merged=window.ScholarSyncState.reconcile(op.base,op.next,remote,op.id);
            if(op.key==='scholar-cases-v1'&&op.next!==null&&merged===null)throw Error('This patient was deleted on another device. Your draft has been retained.');
            return {merged,data:{value:JSON.stringify({data:merged}),revision:(data?.revision||0)+1,updatedAt:F.serverTimestamp()}};
          });
          next.forEach((result,i)=>transaction.set(refs[i],result.data));
          return next.map(result=>result.merged);
        });
      }
    };
    const revisions=new Map(snapshot.docs.map(item=>[item.id,item.data().revision]));
    sync.connect({uid: user.uid, email: user.email}, adapter, readSnapshot(snapshot));initialized = true;
    stop = F.onSnapshot(state, {includeMetadataChanges: true}, next => {
      // Local optimistic snapshots are not server acknowledgements.
      if (!next.metadata.fromCache && !next.metadata.hasPendingWrites) {
        try {
          const delta=new Map(),changes=typeof next.docChanges==='function'?next.docChanges():next.docs.map(doc=>({type:'modified',doc}));
          for(const change of changes){
            const item=change.doc;
            if(change.type==='removed'){
              const id=decodeURIComponent(escape(atob(item.id.replaceAll('-','+').replaceAll('_','/'))));
              delta.set(id,null);revisions.delete(item.id);
            }else{
              const revision=item.data().revision;if(revisions.get(item.id)===revision)continue;
              for(const pair of readSnapshot({docs:[item]}))delta.set(...pair);
              revisions.set(item.id,revision);
            }
          }
          if(delta.size)sync.receiveChanges(delta);
        } catch (error) { sync.error(error.message); }
      }
    }, error => sync.error(error.message));
    await startApps();
  } catch (error) {
    sync.error(error.message);
    document.getElementById('cloud-status').textContent = 'Cloud unavailable · retry';
    // A failed read must never become an empty, writable authenticated account.
    sync.connect(null,null);initialized=true;sync.error(error.message);await startApps();
  }
}
if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true}));
mount();
preparedApps=prepareApps();preparedApps.catch(()=>{});
try {
  const base = 'https://www.gstatic.com/firebasejs/13.2.0/';
  const [app, authModule, firestoreModule] = await timed(Promise.all([
    import(base+'firebase-app.js'), import(base+'firebase-auth.js'), import(base+'firebase-firestore.js')
  ]));
  A = authModule; F = firestoreModule;
  const firebase = app.initializeApp(firebaseConfig);
  auth = A.getAuth(firebase);
  // Only the login session persists; application and patient data have no disk cache.
  await A.setPersistence(auth, A.browserLocalPersistence);
  db = F.initializeFirestore(firebase, {localCache: F.memoryLocalCache()});
  await A.getRedirectResult(auth);
  A.onAuthStateChanged(auth, user => { accountChanged(user).catch(error => sync.error(error.message)); });
} catch (error) {
  sync.connect(null, null);sync.error(error.message);
  await startApps(); // Public reading remains available if Firebase cannot load.
}

window.addEventListener('pageshow',event=>{if(event.persisted){document.body.hidden=true;location.reload();}});
