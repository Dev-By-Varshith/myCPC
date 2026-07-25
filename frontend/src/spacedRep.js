// ── Spaced Repetition Engine (localStorage-backed, Ebbinghaus curve) ──
// Intervals in days per stage: [new, 3d, 7d, 14d, 30d, 90d, mastered]
const SR_INTERVALS = [0, 3, 7, 14, 30, 90];

const DB_KEY = 'ag_spaced_rep_v1';
const ATTEMPTS_KEY = 'ag_sr_attempts_v1';
const PREFLIGHT_KEY = 'ag_preflights_v1';
const TILT_KEY = 'ag_tilt_v1';
const CYCLE_KEY = 'ag_training_cycle_v1';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── CRUD helpers ──────────────────────────────────────────────────────
function loadDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY) || '{}'); } catch { return {}; }
}
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}
function loadAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '[]'); } catch { return []; }
}
function saveAttempts(a) {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
}
function loadPreflights() {
  try { return JSON.parse(localStorage.getItem(PREFLIGHT_KEY) || '{}'); } catch { return {}; }
}
function savePreflights(p) {
  localStorage.setItem(PREFLIGHT_KEY, JSON.stringify(p));
}

// ── Spaced Rep API ────────────────────────────────────────────────────

export function addToSpacedRep(problem, triggerReason = 'manual_add') {
  const db = loadDB();
  const id = `${problem.contestId}-${problem.index}`;
  if (db[id]) return; // already tracked
  db[id] = {
    id,
    contestId: problem.contestId,
    index: problem.index,
    name: problem.name,
    rating: problem.rating || 0,
    tags: problem.tags || [],
    triggerReason,
    reviewStage: 0,
    nextReviewAt: addDays(new Date(), SR_INTERVALS[1]), // first review in 3 days
    lastReviewedAt: null,
    failedCount: 0,
    passedCount: 0,
    addedAt: new Date().toISOString(),
  };
  saveDB(db);
  return db[id];
}

export function getDailyQueue() {
  const db = loadDB();
  const now = new Date();
  return Object.values(db).filter(p =>
    p.reviewStage < 5 && new Date(p.nextReviewAt) <= now
  ).sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
}

export function getAllTracked() {
  return Object.values(loadDB()).sort((a, b) =>
    new Date(a.nextReviewAt) - new Date(b.nextReviewAt)
  );
}

export function reviewProblem(id, outcome) {
  const db = loadDB();
  const p = db[id];
  if (!p) return null;

  const stageBefore = p.reviewStage;
  let stageAfter, nextReview;

  if (outcome === 'pass') {
    stageAfter = Math.min(p.reviewStage + 1, 5);
    nextReview = stageAfter === 5
      ? addDays(new Date(), SR_INTERVALS[5])
      : addDays(new Date(), SR_INTERVALS[stageAfter]);
    p.passedCount++;
  } else {
    // FAIL: reset to stage 1, not 0 — prevents instant flood
    stageAfter = 1;
    nextReview = addDays(new Date(), SR_INTERVALS[1]);
    p.failedCount++;
  }

  p.reviewStage = stageAfter;
  p.nextReviewAt = nextReview;
  p.lastReviewedAt = new Date().toISOString();
  saveDB(db);

  // Log attempt
  const attempts = loadAttempts();
  attempts.push({
    problemId: id,
    reviewedAt: new Date().toISOString(),
    outcome,
    stageBefore,
    stageAfter,
  });
  saveAttempts(attempts);

  return db[id];
}

export function removeFromSpacedRep(id) {
  const db = loadDB();
  delete db[id];
  saveDB(db);
}

export function getAttemptHistory(id) {
  return loadAttempts().filter(a => a.problemId === id);
}

// ── Pre-Flight Check API ──────────────────────────────────────────────

export function savePreFlight(problemId, data) {
  // data = { targetTC, spaceTC, edgeCases, approach, submittedAt }
  const pf = loadPreflights();
  if (!pf[problemId]) pf[problemId] = [];
  pf[problemId].push({ ...data, submittedAt: new Date().toISOString() });
  savePreflights(pf);
}

export function getPreFlights(problemId) {
  return (loadPreflights()[problemId] || []);
}

export function hasCompletedPreFlight(problemId) {
  const pf = loadPreflights()[problemId] || [];
  // Check if there's a preflight within the last 4 hours for this session
  const fourHoursAgo = Date.now() - 4 * 3600 * 1000;
  return pf.some(p => new Date(p.submittedAt).getTime() > fourHoursAgo);
}

// ── Tilt Detector ─────────────────────────────────────────────────────

export function loadTiltState() {
  try { return JSON.parse(localStorage.getItem(TILT_KEY) || 'null'); } catch { return null; }
}
export function saveTiltState(state) {
  localStorage.setItem(TILT_KEY, JSON.stringify(state));
}
export function clearTilt() {
  localStorage.removeItem(TILT_KEY);
}
export function isTiltActive() {
  const t = loadTiltState();
  if (!t) return false;
  return new Date(t.lockoutUntil) > new Date();
}
export function triggerTilt(waCount) {
  const lockoutUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  const state = {
    triggeredAt: new Date().toISOString(),
    waCount,
    lockoutUntil,
  };
  saveTiltState(state);
  return state;
}
export function getTiltRemainingSeconds() {
  const t = loadTiltState();
  if (!t) return 0;
  const remaining = (new Date(t.lockoutUntil) - new Date()) / 1000;
  return Math.max(0, Math.round(remaining));
}

// ── Training Cycle (Periodization) ───────────────────────────────────

export function loadCycle() {
  try { return JSON.parse(localStorage.getItem(CYCLE_KEY) || '{}'); } catch { return {}; }
}
export function saveCycle(c) {
  localStorage.setItem(CYCLE_KEY, JSON.stringify(c));
}
export function getTodayCycle() {
  const c = loadCycle();
  return c[today()] || null;
}
export function setTodayCycle(type, problems = []) {
  const c = loadCycle();
  c[today()] = { type, problems, status: 'active', createdAt: new Date().toISOString() };
  saveCycle(c);
  return c[today()];
}
export function updateCycleProblemStatus(date, problemId, status) {
  const c = loadCycle();
  if (!c[date]) return;
  c[date].problems = c[date].problems.map(p =>
    p.id === problemId ? { ...p, status, completedAt: new Date().toISOString() } : p
  );
  saveCycle(c);
}
export function getCycleHistory(days = 30) {
  const c = loadCycle();
  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    result.push({ date: key, ...(c[key] || { type: null, status: null }) });
  }
  return result;
}
