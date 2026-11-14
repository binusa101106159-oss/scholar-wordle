/* Account data stays in memory. Firestore is the durable source, not localStorage. */
(() => {
  'use strict';
  const chunks = new Map(), queue = new Map(), listeners = new Set();
  const groups = new Map(), cache = new Map(), keyCache = new Map(), guestEdits = new Set();
  const S = window.ScholarSyncState;
  let transport = null, user = null, sequence = 0, flushing = null, confirming = false, failure = null, phase = 'loading';
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const allowed = key => /^(?:scholar[-_]|oxford_wordle_v1$|epi-pbl:)/.test(key) && !/(?:api.?key|token|secret|credential)/i.test(key);
  const quiet = key => /^scholar-(?:navigation|calendar|laws|guides|health|ama|notes|review|ilo-views)-v1$/.test(key);
  const status = () => ({user, phase, paused: Boolean(queue.size && editing()), pending: queue.size + Number(confirming), background: !confirming && queue.size > 0 && [...queue.values()].every(op=>quiet(op.key)), error: failure});
  let previousStatus;
  const notify = () => {
    const next=status(), signature=JSON.stringify(next);
    if(signature===previousStatus)return;previousStatus=signature;
    window.dispatchEvent(new CustomEvent('scholar-sync-status', {detail: next}));
  };
  const keyOf = id => {if(!keyCache.has(id))keyCache.set(id,JSON.parse(id)[0]);return keyCache.get(id);};
  function put(id,value) {
    if((chunks.get(id)??null)===value)return false;
    const key=keyOf(id);let group=groups.get(key);
    if(value===null){chunks.delete(id);group?.delete(id);if(!group?.size)groups.delete(key);}
    else {chunks.set(id,value);if(!group){group=new Map();groups.set(key,group);}group.set(id,value);}
    cache.delete(key);return true;
  }
  const getItem = key => {if(!cache.has(key))cache.set(key,S.join(key,groups.get(key)||new Map()));return cache.get(key);};
  const deferred = new Map();
  const editing = () => typeof document !== 'undefined' && (
    document.activeElement?.matches?.('input:not([type=button]):not([type=submit]):not([type=reset]),textarea,select,[contenteditable="true"]') ||
    document.querySelector?.('dialog[open] form')
  );
  function drainUpdates() {
    if(editing())return;
    const pending=[...deferred];deferred.clear();
    for(const [key,oldValue] of pending)emit(key,oldValue);
    // Leaving the input/dialog ends the editing action and releases its outbox.
    if(queue.size)schedule(true);
    notify();
  }
  if(typeof document !== 'undefined'){
    // Server state can advance immediately, but redrawing a live editor can
    // destroy its caret, IME composition, dropdown or unsaved dialog draft.
    const later=()=>setTimeout(drainUpdates,0);
    document.addEventListener('focusin',notify);
    document.addEventListener('focusout',later);
    document.addEventListener('compositionend',later);
    document.addEventListener('close',later,true);
  }
  function emit(key, oldValue) {
    if(editing()){
      if(!deferred.has(key))deferred.set(key,oldValue);
      return;
    }
    if(deferred.has(key)){oldValue=deferred.get(key);deferred.delete(key);}
    const newValue = getItem(key);
    if (newValue === oldValue) return;
    // The existing case/checklist listeners use the standard storage event.
    window.dispatchEvent(new StorageEvent('storage', {key, oldValue, newValue}));
    for (const listener of listeners) listener(key, newValue);
  }
  function setItem(key, raw) {
    if (!allowed(key)) throw Error('This key is not syncable');
    raw = String(raw);
    const before = S.split(key, getItem(key)), after = S.split(key, raw);
    let changed=false;
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const oldValue = before.get(id) ?? null, value = after.get(id) ?? null;
      if (oldValue === value) continue;
      if (new TextEncoder().encode(JSON.stringify({data: value})).length > 800000) throw Error('This item is too large to sync');
      put(id,value);changed=true;
      if (user) {
        const pending = queue.get(id);
        if(pending && pending.base===value && !flushing)queue.delete(id);
        else queue.set(id, {id, key, base: pending ? pending.base : oldValue, next: value, seq: ++sequence});
      }
    }
    if(!changed)return;
    if (user) { phase = failure?'error':queue.size||confirming?'pending':'synced'; notify(); if(queue.size)schedule();else clearTimeout(timer); }
    else { if(editing())guestEdits.add(key);phase = 'guest'; notify(); }
  }
  let timer, queuedSince = null, retryAt = 0, retryCount = 0;
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  const transient = error => /(?:unavailable|deadline-exceeded|aborted|resource-exhausted|network|offline|connection|timeout)/i.test(error.code || error.message || '');
  function schedule(finished = false) {
    clearTimeout(timer);
    if(!queue.size||offline()||editing())return;
    const now=Date.now();if(queuedSince===null)queuedSince=now;
    // Active editors pause background sends. Other queued actions coalesce
    // with a maximum five-second wait; leaving the editor releases them.
    const idle=finished?0:[...queue.values()].every(op=>quiet(op.key))?1600:1200;
    const delay=Math.max(0,Math.max(Math.min(now+idle,queuedSince+5000),retryAt)-now);
    timer=setTimeout(()=>flush(true).catch(()=>{}),delay);
  }
  async function flush(automatic = false) {
    clearTimeout(timer);
    if(automatic&&editing())return;
    if (!user || !transport) throw Error('Sign in to save to the cloud.');
    if (flushing) return flushing;
    if(!queue.size)return;
    if(offline()){failure='Offline. Pending changes are retained until your connection returns.';phase='error';notify();throw Error(failure);}
    queuedSince=null;
    const identity = user.uid;
    let resolveFlush,rejectFlush;
    const run=new Promise((resolve,reject)=>{resolveFlush=resolve;rejectFlush=reject;});
    flushing=run;
    (async () => {
      failure = null;
      const watchdog=setTimeout(()=>{
        if(user?.uid===identity){failure='Cloud save is taking too long. Your pending changes are retained.';phase='error';notify();}
      },15000);
      try {
        while (queue.size) {
          const ops=[];let bytes=0;
          for(const pending of queue.values()){
            const size=(pending.next?.length||0)+(pending.base?.length||0);
            if(ops.length&&(ops.length>=16||bytes+size>700000))break;
            ops.push({...pending});bytes+=size;
          }
          const results = transport.commitMany ? await transport.commitMany(ops) : await Promise.all(ops.map(op=>transport.commit(op)));
          if (user?.uid !== identity) throw Error('Account changed during save.');
          const previous=new Map(ops.map(op=>[op.key,getItem(op.key)]));
          ops.forEach((op,i)=>{
            const current = queue.get(op.id), result=results[i];
            if (current?.seq === op.seq) {queue.delete(op.id);put(op.id,result);}
            else if (current) current.base = result;
          });
          for(const [key,raw]of previous)emit(key,raw);
          // Allow input, painting and network events between acknowledged batches.
          if(automatic&&editing()&&queue.size)break;
          if(queue.size)await new Promise(resolve=>setTimeout(resolve,0));
        }
        failure = null;phase = queue.size?'pending':'synced';retryAt=0;retryCount=0;
      } catch (error) {
        failure = error.message || String(error);phase = 'error';
        if(user?.uid===identity&&queue.size&&transient(error)){
          retryAt=Date.now()+Math.min(30000,2000*2**Math.min(retryCount++,4));schedule();
        }
        throw error;
      }
      finally { clearTimeout(watchdog);flushing = null; notify();if(queue.size&&!failure)schedule(); }
    })().then(resolveFlush,rejectFlush);
    return run;
  }
  function receive(entries) {
    const next=new Map(entries);
    for (const op of queue.values()) {
      const raw = S.reconcile(op.base, op.next, entries.get(op.id) ?? null, op.id);
      next.set(op.id,raw);
    }
    const changed=[...new Set([...chunks.keys(),...next.keys()])].filter(id=>(chunks.get(id)??null)!==(next.get(id)??null));
    const before=new Map(changed.map(id=>[keyOf(id),getItem(keyOf(id))]));
    for(const id of changed)put(id,next.get(id)??null);
    for(const [key,raw]of before)emit(key,raw);
    if (!queue.size && phase !== 'error') phase = 'synced';
    notify();
  }
  function receiveChanges(entries) {
    const before=new Map();
    for(const [id,remote]of entries){
      const op=queue.get(id),raw=op?S.reconcile(op.base,op.next,remote,op.id):remote;
      if((chunks.get(id)??null)===raw)continue;
      const key=keyOf(id);if(!before.has(key))before.set(key,getItem(key));put(id,raw);
    }
    for(const [key,raw]of before)emit(key,raw);
    if(!queue.size&&phase!=='error')phase='synced';notify();
  }
  function connect(identity, adapter, entries, resumeGuest = false) {
    const resume=resumeGuest&&identity&&!user;
    const previous=resume?new Map([...groups.keys()].map(key=>[key,getItem(key)])):new Map();
    const drafts=resume?new Map([...guestEdits].map(key=>[key,getItem(key)])):new Map();
    // Reconnecting the same account is not an account reset. Keep drafts and
    // in-flight operations; merge the server snapshot around pending edits.
    if (identity && user?.uid === identity.uid) {
      user = identity; transport = adapter;
      if (entries) receive(entries);
      if (queue.size && !flushing) schedule();
      notify();return;
    }
    clearTimeout(timer);queuedSince=null;retryAt=0;retryCount=0;
    user = identity; transport = adapter; failure = null; deferred.clear();chunks.clear(); queue.clear();groups.clear();cache.clear();keyCache.clear();
    if (entries) for (const [id, value] of entries) if (value !== null) put(id,value);
    guestEdits.clear();
    if(resume){
      for(const [key,raw]of drafts)if(raw!==null)setItem(key,raw);
      for(const key of new Set([...previous.keys(),...groups.keys()]))emit(key,previous.get(key)??null);
    }
    phase = queue.size?'pending':identity ? 'synced' : 'guest'; notify(); resolveReady();
  }
  async function setConfirmed(key, raw) {
    if (!user || !transport) throw Error('Please sign in before saving patient records.');
    if (confirming) throw Error('A save is already in progress.');
    const before = S.split(key, getItem(key)), after = S.split(key, String(raw));
    confirming = true;phase = 'pending';failure = null;notify();
    try {
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        const base = before.get(id) ?? null, next = after.get(id) ?? null;
        if (base === next) continue;
        if (new TextEncoder().encode(JSON.stringify({data: next})).length > 800000) throw Error('This record is too large.');
        const result = await transport.commit({id, key, base, next});
        const previous = getItem(key);
        put(id,result);
        emit(key, previous);
      }
      phase = queue.size ? 'pending' : 'synced';
    } catch (err) { failure = err.message;phase = 'error';throw err; }
    finally { confirming = false;notify();if(queue.size)schedule(); }
  }
  function error(message) { failure = message; phase = 'error'; notify(); }
  const storage = {
    getItem, setItem, setConfirmed,
    removeItem(key) { // Generic empty-object write retains revisioned deletion markers.
      const old = getItem(key); if (old === null) return;
      for (const [id, base] of S.split(key, old)) {
        put(id,null); if (user) queue.set(id, {id, key, base: queue.get(id)?.base ?? base, next: null, seq: ++sequence});
      }
      if (user) { phase = 'pending'; notify(); schedule(); }
    },
    key(index) { return [...groups.keys()][index] ?? null; },
    get length() { return groups.size; }
  };
  window.ScholarStorage = storage;
  window.ScholarSync = {ready, flush, status, connect, receive, receiveChanges, error, allowed,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    requireAccount() { if (!user || phase === 'loading') throw Error('Please sign in before saving patient records.'); },
    get transport() { return transport; }
  };
  window.addEventListener('offline',()=>clearTimeout(timer));
  window.addEventListener('online', () => { retryAt=0;retryCount=0;if(queue.size)flush(true).catch(()=>{}); });
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden&&queue.size&&!editing())flush(true).catch(()=>{});});
  window.addEventListener('beforeunload', event => {
    if (queue.size || confirming) { event.preventDefault(); event.returnValue = ''; }
  });
})();
