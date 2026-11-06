/* Pure state reconciliation shared by the browser client and concurrency tests. */
((root) => {
  'use strict';
  const missing = Symbol('missing');
  const equal = (a, b) => a === b || (a !== missing && b !== missing && JSON.stringify(a) === JSON.stringify(b));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.hasOwn(value, key) ? value[key] : missing;
  function merge(base, next, remote, context = '') {
    if (equal(base, next)) return remote;
    if (equal(base, remote)) return next;
    if (next === missing) return missing;
    // A stale edit cannot recreate a record deleted on another device.
    if (remote === missing && base !== missing) return missing;
    if (object(next) && object(remote)) {
      const before = object(base) ? base : {};
      return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(next), ...Object.keys(remote)])]
        .map(key => [key, merge(own(before, key), own(next, key), own(remote, key), context + '/' + key)])
        .filter(([, value]) => value !== missing));
    }
    if (Array.isArray(next) && Array.isArray(remote)) {
      const before = Array.isArray(base) ? base : [];
      if (context.includes('checked') || context.includes('/solved/')) {
        const removed = new Set(before.filter(value => !next.includes(value)));
        return [...new Set([...remote.filter(value => !removed.has(value)), ...next.filter(value => !before.includes(value))])];
      }
      const identifiable = a => a.every(v => object(v) && typeof v.id === 'string');
      if (identifiable(before) && identifiable(next) && identifiable(remote)) {
        const map = a => Object.fromEntries(a.map(v => [v.id, v]));
        return Object.values(merge(map(before), map(next), map(remote), context));
      }
      // Puzzle cells and pencil marks can merge only within an unchanged puzzle.
      if (context.includes('/values') || context.includes('/notes')) {
        return remote.map((v, i) => equal(before[i], next[i]) ? v : next[i]);
      }
    }
    if (context.endsWith('/seconds') && typeof next === 'number' && typeof remote === 'number') return Math.max(next, remote);
    return next;
  }
  function reconcile(baseRaw, nextRaw, remoteRaw, context) {
    if (nextRaw === null) return null;
    if (baseRaw !== null && remoteRaw === null) return null;
    if (baseRaw === nextRaw) return remoteRaw;
    if (baseRaw === remoteRaw) return nextRaw;
    try {
      const base = baseRaw === null ? missing : JSON.parse(baseRaw);
      const next = JSON.parse(nextRaw), remote = remoteRaw === null ? missing : JSON.parse(remoteRaw);
      if ((context.includes('wordle-results') || context.includes('ilo-results')) && baseRaw === null && remoteRaw !== null) return remoteRaw;
      if (context.includes('scholar-wordle-round-v1')) {
        if (object(remote) && next.gameId === remote.gameId && remote.guesses?.length > next.guesses?.length) return remoteRaw;
        return nextRaw;
      }
      if (context.includes('scholar_puzzles_v1') && object(next) && object(remote) &&
          !equal(next.puzzle, remote.puzzle)) return nextRaw; // Replace a new puzzle as one unit.
      const result = merge(base, next, remote, context);
      return result === missing ? null : JSON.stringify(result);
    } catch (_) { return nextRaw; }
  }
  function split(key, raw) {
    const out = new Map();
    if (raw === null) return out;
    let data;
    try { data = JSON.parse(raw); } catch (_) { /* Plain-text PBL answers. */ }
    if (key === 'scholar-wordle-round-v1') out.set(JSON.stringify([key]), raw);
    else if (object(data)) {
      if (key === 'scholar-cases-v1') {
        if (data.version !== 1 || !Array.isArray(data.records)) throw Error('Invalid patient list');
        for (const record of data.records) out.set(JSON.stringify([key, 'records', record.id]), JSON.stringify(record));
      } else for (const [field, value] of Object.entries(data)) out.set(JSON.stringify([key, field]), JSON.stringify(value));
    } else out.set(JSON.stringify([key]), raw);
    return out;
  }
  function join(key, chunks) {
    const pairs = [...chunks].filter(([id, value]) => JSON.parse(id)[0] === key && value !== null);
    if (!pairs.length) return null;
    const single = pairs.find(([id]) => JSON.parse(id).length === 1);
    if (single) return single[1];
    if (key === 'scholar-cases-v1') return JSON.stringify({version: 1, records: pairs
      .filter(([id]) => JSON.parse(id)[1] === 'records').map(([, raw]) => JSON.parse(raw))
      .sort((a,b)=>(Number.isFinite(a.sortOrder)?a.sortOrder:-(a.createdAt||0))-(Number.isFinite(b.sortOrder)?b.sortOrder:-(b.createdAt||0))||b.id.localeCompare(a.id))});
    return JSON.stringify(Object.fromEntries(pairs.sort(([a],[b])=>a.localeCompare(b)).map(([id, raw]) => [JSON.parse(id)[1], JSON.parse(raw)])));
  }
  function wordleStats(results, initial) {
    const stats = initial ? {...initial, dist: initial.dist.slice()} : {played: 0, wins: 0, streak: 0, maxStreak: 0, dist: Array(10).fill(0)};
    while(stats.dist.length<10)stats.dist.push(0);
    for (const result of Object.values(results || {}).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
      stats.played++;
      if (result.won) { stats.wins++; stats.streak++; stats.dist[Math.max(0, Math.min(9, result.guesses - 1))]++; }
      else stats.streak = 0;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    }
    return stats;
  }
  const api = {merge, reconcile, split, join, wordleStats};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScholarSyncState = api;
})(globalThis);
