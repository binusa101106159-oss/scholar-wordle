import {firebaseConfig} from './firebase-config.js';

const sync = window.ScholarSync;
let auth, db, A, F, stop, initialized = false, started = false;
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
  bar.innerHTML = '<span id="cloud-status" role="status" aria-live="polite">Connecting…</span><button id="cloud-signin" type="button">Sign in</button><button id="cloud-retry" type="button" hidden>Retry</button><details id="cloud-account" hidden><summary>Account</summary><div id="cloud-account-menu"><p id="cloud-email"></p><button id="cloud-signout" type="button">Sign out</button></div></details>';
  document.body.append(bar);
  const by = id => document.getElementById(id);
  const render = () => {
    const state = sync.status();bar.dataset.state = state.phase;
    by('cloud-status').textContent = state.phase === 'loading' ? 'Connecting…' : state.phase === 'guest' ? 'Not signed in · not saved' : state.phase === 'error' ? 'Not synced · retry' : state.pending ? 'Syncing…' : 'Synced';
    by('cloud-status').title = state.error || (state.user ? state.user.email : 'Sign in to save across devices. Guest changes last only for this visit.');
    by('cloud-signin').hidden = Boolean(state.user);by('cloud-account').hidden = !state.user;
    by('cloud-signout').disabled = state.pending > 0;
    by('cloud-email').textContent = state.user?.email || '';
    by('cloud-retry').hidden = state.phase !== 'error';
  };
  window.addEventListener('scholar-sync-status', render); render();
  by('cloud-signin').onclick = async () => {
    try {
      if (!auth) throw Error('Firebase could not load. Check the network and reload.');
      await A.signInWithPopup(auth, new A.GoogleAuthProvider());
    } catch (error) { sync.error(error.message); }
  };
  by('cloud-signout').onclick = async () => {
    try { if (sync.status().pending) await sync.flush();await A.signOut(auth); }
    catch (error) { sync.error(error.message); }
  };
  by('cloud-retry').onclick = () => sync.status().pending ? sync.flush().catch(() => {}) : location.reload();
}
async function startApps() {
  if (started) return;started = true;
  const nodes = [...document.querySelectorAll('script[data-cloud-src], script[data-cloud-inline]')]
    .filter(node => !(node.hasAttribute('data-cloud-seed') && sync.status().user));
  // Fetch independently; execute in document order, after initial account hydration.
  const sources = await Promise.all(nodes.map(async node => {
    if (!node.dataset.cloudSrc) return node.textContent;
    const response = await fetch(new URL(node.dataset.cloudSrc, location.href));
    if (!response.ok) throw Error('Could not load '+node.dataset.cloudSrc);
    return response.text();
  }));
  for (let i=0;i<nodes.length;i++) {
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
        const ref = F.doc(state, docID(op.id));
        return F.runTransaction(db, async transaction => {
          const current = await transaction.get(ref), data = current.exists() ? current.data() : null;
          const remote = data ? JSON.parse(data.value).data : null;
          const merged = window.ScholarSyncState.reconcile(op.base, op.next, remote, op.id);
          if (op.key === 'scholar-cases-v1' && op.next !== null && merged === null) throw Error('This patient was deleted on another device. Your draft has been retained.');
          transaction.set(ref, {value: JSON.stringify({data: merged}), revision: (data?.revision || 0)+1, updatedAt: F.serverTimestamp()});
          return merged;
        });
      }
    };
    sync.connect({uid: user.uid, email: user.email}, adapter, readSnapshot(snapshot));initialized = true;
    stop = F.onSnapshot(state, {includeMetadataChanges: true}, next => {
      // Local optimistic snapshots are not server acknowledgements.
      if (!next.metadata.fromCache && !next.metadata.hasPendingWrites) {
        try { sync.receive(readSnapshot(next)); } catch (error) { sync.error(error.message); }
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
