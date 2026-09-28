// Install-time fallback (Section 16): if better-sqlite3 fails to install or
// build on this machine, its import throws here, and we swap to the
// flat-JSON-file store (db.json.js), which implements the identical 4
// function signatures. No other file in the system needs to change.
let impl;
try {
  impl = await import('./db.sqlite.js');
} catch (err) {
  console.warn('better-sqlite3 unavailable, falling back to JSON file store:', err.message);
  impl = await import('./db.json.js');
}

export const insertTask = impl.insertTask;
export const insertDecision = impl.insertDecision;
export const getDecisions = impl.getDecisions;
export const getStats = impl.getStats;
