/* Account data stays in memory. Firestore is the durable source, not localStorage. */
(() => {
  'use strict';
  const chunks = new Map(), queue = new Map(), listeners = new Set();
  const S = window.ScholarSyncState;
  let transport = null, user = null, sequence = 0, flushing = null, confirming = false, failure = null, phase = 'loading';
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const allowed = key => /^(?:scholar[-_]|oxford_wordle_v1$|epi-pbl:)/.test(key) && !/(?:api.?key|token|secret|credential)/i.test(key);
  const status = () => ({user, phase, pending: queue.size + Number(confirming), error: failure});
  const notify = () => window.dispatchEvent(new CustomEvent('scholar-sync-status', {detail: status()}));
  const getItem = key => S.join(key, chunks);
  function emit(key, oldValue) {
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
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const oldValue = before.get(id) ?? null, value = after.get(id) ?? null;
      if (oldValue === value) continue;
      if (new TextEncoder().encode(JSON.stringify({data: value})).length > 800000) throw Error('This item is too large to sync');
      if (value === null) chunks.delete(id); else chunks.set(id, value);
      if (user) {
        const pending = queue.get(id);
        queue.set(id, {id, key, base: pending ? pending.base : oldValue, next: value, seq: ++sequence});
      }
    }
    if (user) { phase = 'pending'; notify(); schedule(); }
    else { phase = 'guest'; notify(); }
  }
  let timer;
  function schedule() { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 450); }
  async function flush() {
    clearTimeout(timer);
    if (!user || !transport) throw Error('Sign in to save to the cloud.');
    if (flushing) { await flushing; return queue.size ? flush() : undefined; }
    const identity = user.uid;
    flushing = (async () => {
      failure = null;
      try {
        while (queue.size) {
          const op = {...queue.values().next().value};
          const result = await transport.commit(op);
          if (user?.uid !== identity) throw Error('Account changed during save.');
          const current = queue.get(op.id);
          if (current?.seq === op.seq) {
            queue.delete(op.id);
            const previous = getItem(op.key);
            if (result === null) chunks.delete(op.id); else chunks.set(op.id, result);
            emit(op.key, previous);
          } else if (current) current.base = result;
        }
        phase = 'synced';
      } catch (error) { failure = error.message || String(error); phase = 'error'; throw error; }
      finally { flushing = null; notify(); }
    })();
    return flushing;
  }
  function receive(entries) {
    const keys = new Set([...chunks.keys(), ...entries.keys()].map(id => JSON.parse(id)[0]));
    const before = new Map([...keys].map(key => [key, getItem(key)]));
    chunks.clear();
    for (const [id, raw] of entries) if (raw !== null) chunks.set(id, raw);
    for (const op of queue.values()) {
      const raw = S.reconcile(op.base, op.next, entries.get(op.id) ?? null, op.id);
      if (raw === null) chunks.delete(op.id); else chunks.set(op.id, raw);
    }
    for (const key of keys) emit(key, before.get(key));
    if (!queue.size && phase !== 'error') phase = 'synced';
    notify();
  }
  function connect(identity, adapter, entries) {
    user = identity; transport = adapter; failure = null; chunks.clear(); queue.clear();
    if (entries) for (const [id, value] of entries) if (value !== null) chunks.set(id, value);
    phase = identity ? 'synced' : 'guest'; notify(); resolveReady();
  }
  async function setConfirmed(key, raw) {
    if (!user || !transport) throw Error('Please sign in before saving patient records.');
    if (confirming) throw Error('A save is already in progress.');
    if (queue.size || flushing) await flush();
    const before = S.split(key, getItem(key)), after = S.split(key, String(raw));
    confirming = true;phase = 'pending';failure = null;notify();
    try {
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        const base = before.get(id) ?? null, next = after.get(id) ?? null;
        if (base === next) continue;
        if (new TextEncoder().encode(JSON.stringify({data: next})).length > 800000) throw Error('This record is too large.');
        const result = await transport.commit({id, key, base, next});
        const previous = getItem(key);
        if (result === null) chunks.delete(id);else chunks.set(id, result);
        emit(key, previous);
      }
      phase = queue.size ? 'pending' : 'synced';
    } catch (err) { failure = err.message;phase = 'error';throw err; }
    finally { confirming = false;notify(); }
  }
  function error(message) { failure = message; phase = 'error'; notify(); }
  const storage = {
    getItem, setItem, setConfirmed,
    removeItem(key) { // Generic empty-object write retains revisioned deletion markers.
      const old = getItem(key); if (old === null) return;
      for (const [id, base] of S.split(key, old)) {
        chunks.delete(id); if (user) queue.set(id, {id, key, base: queue.get(id)?.base ?? base, next: null, seq: ++sequence});
      }
      if (user) { phase = 'pending'; notify(); schedule(); }
    },
    key(index) { return [...new Set([...chunks.keys()].map(id => JSON.parse(id)[0]))][index] ?? null; },
    get length() { return new Set([...chunks.keys()].map(id => JSON.parse(id)[0])).size; }
  };
  window.ScholarStorage = storage;
  window.ScholarSync = {ready, flush, status, connect, receive, error, allowed,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    requireAccount() { if (!user || phase === 'loading') throw Error('Please sign in before saving patient records.'); },
    get transport() { return transport; }
  };
  window.addEventListener('online', () => { if (queue.size) flush().catch(() => {}); });
  window.addEventListener('beforeunload', event => {
    if (queue.size || confirming) { event.preventDefault(); event.returnValue = ''; }
  });
})();
