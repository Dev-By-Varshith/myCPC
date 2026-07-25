// Anti Gravity — Node.js Backend
// Fastify + SQLite + WebSocket Tilt Detector
// Run: node server.js

'use strict';
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const { WebSocketServer } = require('ws');
const https = require('https');
const path = require('path');

// ── Init ──────────────────────────────────────────────────────────────
const app = Fastify({ logger: { level: 'warn' } });
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);
const PORT = process.env.PORT || 3002;

// ── DB Schema ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS cf_problems (
    id TEXT PRIMARY KEY,
    contest_id INTEGER NOT NULL,
    problem_index TEXT NOT NULL,
    problem_name TEXT NOT NULL,
    rating INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    solved_count INTEGER DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(contest_id, problem_index)
  );
  CREATE INDEX IF NOT EXISTS idx_rating ON cf_problems(rating);

  CREATE TABLE IF NOT EXISTS user_solved (
    id TEXT PRIMARY KEY,
    cf_handle TEXT NOT NULL,
    contest_id INTEGER NOT NULL,
    problem_index TEXT NOT NULL,
    verdict TEXT NOT NULL,
    solved_at TEXT NOT NULL,
    UNIQUE(cf_handle, contest_id, problem_index)
  );
  CREATE INDEX IF NOT EXISTS idx_solved_handle ON user_solved(cf_handle);

  CREATE TABLE IF NOT EXISTS tilt_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
    wa_count INTEGER NOT NULL,
    window_seconds INTEGER NOT NULL,
    lockout_until TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coach_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cf_handle TEXT NOT NULL,
    problem_id TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    hints_used INTEGER DEFAULT 0,
    editorial_used INTEGER DEFAULT 0,
    final_verdict TEXT,
    time_taken_sec INTEGER,
    preflight TEXT,
    hint_transcripts TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS upsolve_problems (
    id TEXT PRIMARY KEY,
    contest_id INTEGER NOT NULL,
    problem_index TEXT NOT NULL,
    problem_name TEXT NOT NULL,
    rating INTEGER,
    tags TEXT DEFAULT '[]',
    trigger_reason TEXT DEFAULT 'manual_add',
    review_stage INTEGER NOT NULL DEFAULT 0,
    next_review_at TEXT NOT NULL,
    last_reviewed_at TEXT,
    failed_count INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    cf_handle TEXT,
    lc_handle TEXT,
    nvidia_key TEXT,
    goal_rank TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── CORS ──────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

app.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT'],
});

// ── Auth & Users ──────────────────────────────────────────────────────
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

// IMPORTANT: Replace with your actual Google Client ID
const GOOGLE_CLIENT_ID = '1055325556276-v1l2f1q6k927mpe1fbl748439mnd4733.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function hashPw(pw) { return crypto.createHash('sha256').update(pw).digest('hex'); }

app.post('/api/auth/register', async (req) => {
  const { username, password } = req.body;
  if (!username || !password) return { error: 'Username and password required' };
  try {
    const res = db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`).run(username, hashPw(password));
    return { success: true, userId: res.lastInsertRowid };
  } catch (e) {
    if (e.message.includes('UNIQUE')) return { error: 'Username already exists' };
    return { error: e.message };
  }
});

app.post('/api/auth/login', async (req) => {
  const { username, password } = req.body;
  const user = db.prepare(`SELECT id, username, cf_handle, lc_handle, nvidia_key, goal_rank FROM users WHERE username = ? AND password = ?`).get(username, hashPw(password));
  if (!user) return { error: 'Invalid credentials' };
  return { success: true, user };
});

// ── Google OAuth Login (implicit flow — frontend sends userinfo) ───────
app.post('/api/auth/google', async (req) => {
  // Frontend fetches https://www.googleapis.com/oauth2/v3/userinfo with the
  // access_token and sends us the resulting fields directly.
  const { googleId, email, name, picture } = req.body;
  if (!googleId || !email) return { error: 'Missing Google user info' };

  try {
    // Safe migration: add columns if they don't exist
    try { db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT`); } catch (_) {}
    try { db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`); } catch (_) {}

    // Upsert by google_id
    let user = db.prepare(
      `SELECT id, username, cf_handle, lc_handle, nvidia_key, goal_rank, avatar_url FROM users WHERE google_id = ?`
    ).get(googleId);

    if (!user) {
      const safeUsername = (name || email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '_');
      const insertUser = (uname) => {
        const res = db.prepare(
          `INSERT INTO users (username, password, google_id, avatar_url) VALUES (?, '', ?, ?)`
        ).run(uname, googleId, picture || '');
        return db.prepare(
          `SELECT id, username, cf_handle, lc_handle, nvidia_key, goal_rank, avatar_url FROM users WHERE id = ?`
        ).get(res.lastInsertRowid);
      };
      try {
        user = insertUser(safeUsername);
      } catch (_) {
        user = insertUser(safeUsername + '_' + googleId.slice(-4));
      }
    } else {
      db.prepare(`UPDATE users SET avatar_url = ? WHERE google_id = ?`).run(picture || '', googleId);
      user.avatar_url = picture || '';
    }

    console.log(`[Google Auth] Login: ${user.username} (${email})`);
    return { success: true, user: { ...user, displayName: name, avatar: picture } };
  } catch (e) {
    console.error('[Google Auth] Error:', e.message);
    return { error: e.message };
  }
});

app.put('/api/users/:id', async (req) => {
  const { id } = req.params;
  const { cf_handle, lc_handle, nvidia_key, goal_rank } = req.body;
  db.prepare(`UPDATE users SET cf_handle=?, lc_handle=?, nvidia_key=?, goal_rank=? WHERE id=?`)
    .run(cf_handle || null, lc_handle || null, nvidia_key || null, goal_rank || null, id);
  const user = db.prepare(`SELECT id, username, cf_handle, lc_handle, nvidia_key, goal_rank FROM users WHERE id = ?`).get(id);
  return { success: true, user };
});

// ── CF API helper ─────────────────────────────────────────────────────
function cfGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `https://codeforces.com/api/${endpoint}`;
    https.get(url, { headers: { 'User-Agent': 'AntiGravity/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status !== 'OK') reject(new Error(json.comment || 'CF API Error'));
          else resolve(json.result);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── Problem Sync (runs daily at 3am) ─────────────────────────────────
async function syncProblems() {
  console.log('[SYNC] Fetching CF problemset...');
  try {
    const { problems } = await cfGet('problemset.problems');
    const insert = db.prepare(`
      INSERT OR REPLACE INTO cf_problems (id, contest_id, problem_index, problem_name, rating, tags, solved_count, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const insertMany = db.transaction((probs) => {
      for (const p of probs) {
        const id = `${p.contestId}-${p.index}`;
        insert.run(id, p.contestId, p.index, p.name, p.rating || null, JSON.stringify(p.tags || []), p.solvedCount || 0);
      }
    });
    insertMany(problems);
    console.log(`[SYNC] Synced ${problems.length} problems.`);
  } catch (e) {
    console.error('[SYNC] Failed:', e.message);
  }
}

// Run sync once on startup, then daily
syncProblems();
cron.schedule('0 3 * * *', syncProblems);

// ── User Solved Sync ──────────────────────────────────────────────────
async function syncUserSolved(handle) {
  try {
    const subs = await cfGet(`user.status?handle=${handle}&from=1&count=10000`);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO user_solved (id, cf_handle, contest_id, problem_index, verdict, solved_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((submissions) => {
      for (const s of submissions) {
        if (s.verdict !== 'OK') continue;
        const id = `${handle}-${s.problem.contestId}-${s.problem.index}`;
        insert.run(id, handle, s.problem.contestId, s.problem.index, s.verdict,
          new Date(s.creationTimeSeconds * 1000).toISOString());
      }
    });
    insertMany(subs);
    return { synced: true };
  } catch (e) {
    return { synced: false, error: e.message };
  }
}

// ── TAG-INTERSECTION Query ────────────────────────────────────────────
app.get('/api/problems/tag-search', async (req) => {
  const { tags = '', minRating = 1200, maxRating = 3500, handle = '', limit = 50 } = req.query;
  const tagList = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  if (tagList.length === 0) return { problems: [] };

  // Sync user solved if handle provided
  if (handle) await syncUserSolved(handle);

  // Fetch all problems in rating range
  const problems = db.prepare(`
    SELECT * FROM cf_problems
    WHERE rating >= ? AND rating <= ? AND rating IS NOT NULL
    ORDER BY rating ASC
  `).all(parseInt(minRating), parseInt(maxRating));

  // Filter by all tags present (tag intersection)
  const solved = handle
    ? new Set(db.prepare(`SELECT contest_id || '-' || problem_index AS pid FROM user_solved WHERE cf_handle = ? AND verdict = 'OK'`).all(handle).map(r => r.pid))
    : new Set();

  const result = problems
    .filter(p => {
      const pTags = JSON.parse(p.tags || '[]').map(t => t.toLowerCase());
      return tagList.every(t => pTags.includes(t));
    })
    .filter(p => !solved.has(p.id))
    .slice(0, parseInt(limit))
    .map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') }));

  return { problems: result, total: result.length, handle, tagFilter: tagList };
});

// ── Upsolve Routes ────────────────────────────────────────────────────
app.get('/api/upsolve/queue', async () => {
  const queue = db.prepare(`
    SELECT * FROM upsolve_problems
    WHERE review_stage < 5 AND next_review_at <= datetime('now')
    ORDER BY next_review_at ASC
    LIMIT 20
  `).all();
  return { queue: queue.map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') })) };
});

app.get('/api/upsolve/all', async () => {
  const all = db.prepare(`SELECT * FROM upsolve_problems ORDER BY next_review_at ASC`).all();
  return { problems: all.map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') })) };
});

app.post('/api/upsolve/add', async (req) => {
  const { contestId, index, name, rating, tags, triggerReason } = req.body;
  const id = `${contestId}-${index}`;
  const nextReview = new Date(Date.now() + 3 * 86400000).toISOString();
  try {
    db.prepare(`
      INSERT OR IGNORE INTO upsolve_problems (id, contest_id, problem_index, problem_name, rating, tags, trigger_reason, review_stage, next_review_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, contestId, index, name, rating || 0, JSON.stringify(tags || []), triggerReason || 'manual_add', nextReview);
    return { added: true, id };
  } catch (e) {
    return { added: false, error: e.message };
  }
});

const SR_INTERVALS = [0, 3, 7, 14, 30, 90];
app.post('/api/upsolve/review', async (req) => {
  const { id, outcome } = req.body; // outcome: 'pass' | 'fail'
  const p = db.prepare(`SELECT * FROM upsolve_problems WHERE id = ?`).get(id);
  if (!p) return { error: 'Not found' };

  const stageBefore = p.review_stage;
  let stageAfter, nextReview;
  if (outcome === 'pass') {
    stageAfter = Math.min(stageBefore + 1, 5);
    nextReview = new Date(Date.now() + SR_INTERVALS[stageAfter] * 86400000).toISOString();
    db.prepare(`UPDATE upsolve_problems SET review_stage=?, next_review_at=?, last_reviewed_at=datetime('now'), passed_count=passed_count+1 WHERE id=?`)
      .run(stageAfter, nextReview, id);
  } else {
    stageAfter = 1;
    nextReview = new Date(Date.now() + 3 * 86400000).toISOString();
    db.prepare(`UPDATE upsolve_problems SET review_stage=1, next_review_at=?, last_reviewed_at=datetime('now'), failed_count=failed_count+1 WHERE id=?`)
      .run(nextReview, id);
  }
  return { id, stageBefore, stageAfter, nextReview, outcome };
});

// ── Tilt Detector ─────────────────────────────────────────────────────
let tiltState = null; // { lockoutUntil, waCount }
const TILT_WA_THRESHOLD = 3;
const TILT_WINDOW_SEC = 300;   // 5 min
const TILT_LOCKOUT_SEC = 600;  // 10 min

async function pollTilt(handle) {
  if (!handle) return;
  try {
    const subs = await cfGet(`user.status?handle=${handle}&from=1&count=30`);
    const cutoff = Date.now() / 1000 - TILT_WINDOW_SEC;
    const recentWAs = subs.filter(s => s.verdict === 'WRONG_ANSWER' && s.creationTimeSeconds > cutoff);
    if (recentWAs.length >= TILT_WA_THRESHOLD) {
      const lockoutUntil = new Date(Date.now() + TILT_LOCKOUT_SEC * 1000).toISOString();
      tiltState = { lockoutUntil, waCount: recentWAs.length, triggeredAt: new Date().toISOString() };
      db.prepare(`INSERT INTO tilt_events (wa_count, window_seconds, lockout_until) VALUES (?, ?, ?)`)
        .run(recentWAs.length, TILT_WINDOW_SEC, lockoutUntil);
      // Broadcast to all WebSocket clients
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'TILT_LOCKOUT', ...tiltState }));
        }
      });
      console.log(`[TILT] Triggered for ${handle}: ${recentWAs.length} WAs in ${TILT_WINDOW_SEC}s`);
    }
  } catch (e) {
    // CF API can be slow, don't crash
  }
}

app.get('/api/tilt/status', async () => {
  if (!tiltState) return { active: false };
  const active = new Date(tiltState.lockoutUntil) > new Date();
  if (!active) tiltState = null;
  return { active, ...tiltState };
});

app.get('/api/tilt/history', async () => {
  const events = db.prepare(`SELECT * FROM tilt_events ORDER BY triggered_at DESC LIMIT 20`).all();
  return { events };
});

app.post('/api/tilt/start-polling', async (req) => {
  const { handle } = req.body;
  if (!handle) return { error: 'handle required' };
  // Poll every 60 seconds
  if (app._tiltInterval) clearInterval(app._tiltInterval);
  app._tiltInterval = setInterval(() => pollTilt(handle), 60000);
  pollTilt(handle); // immediate first check
  return { polling: true, handle };
});

// ── Coach Session Routes ──────────────────────────────────────────────
app.post('/api/coach/session/start', async (req) => {
  const { cfHandle, problemId, preflight } = req.body;
  const res = db.prepare(`
    INSERT INTO coach_sessions (cf_handle, problem_id, preflight, hint_transcripts)
    VALUES (?, ?, ?, '[]')
  `).run(cfHandle, problemId || null, JSON.stringify(preflight || {}));
  return { sessionId: res.lastInsertRowid };
});

app.post('/api/coach/session/end', async (req) => {
  const { sessionId, outcome, timeTakenSec, hintsUsed, editorialUsed } = req.body;
  db.prepare(`
    UPDATE coach_sessions
    SET final_verdict=?, time_taken_sec=?, hints_used=?, editorial_used=?
    WHERE id=?
  `).run(outcome, timeTakenSec, hintsUsed || 0, editorialUsed ? 1 : 0, sessionId);
  return { updated: true };
});

app.get('/api/coach/weakness-profile', async (req) => {
  const { handle } = req.query;
  // Aggregate hint rate per tag from sessions
  const sessions = db.prepare(`
    SELECT cs.*, p.tags FROM coach_sessions cs
    LEFT JOIN cf_problems p ON cs.problem_id = p.id
    WHERE cs.cf_handle = ? AND cs.started_at > datetime('now', '-30 days')
  `).all(handle || '');

  const tagStats = {};
  for (const s of sessions) {
    const tags = JSON.parse(s.tags || '[]');
    for (const tag of tags) {
      if (!tagStats[tag]) tagStats[tag] = { total: 0, hintsUsed: 0, editorialUsed: 0, totalTime: 0 };
      tagStats[tag].total++;
      tagStats[tag].hintsUsed += s.hints_used || 0;
      if (s.editorial_used) tagStats[tag].editorialUsed++;
      if (s.time_taken_sec) tagStats[tag].totalTime += s.time_taken_sec;
    }
  }

  const profile = Object.entries(tagStats)
    .map(([tag, s]) => ({
      tag,
      total: s.total,
      hintRate: s.total > 0 ? (s.hintsUsed / s.total).toFixed(2) : 0,
      editorialRate: s.total > 0 ? (s.editorialUsed / s.total).toFixed(2) : 0,
      avgMinutes: s.total > 0 ? Math.round(s.totalTime / s.total / 60) : 0,
    }))
    .sort((a, b) => b.hintRate - a.hintRate);

  return { profile, totalSessions: sessions.length };
});

// ── LLM Socratic Coach ────────────────────────────────────────────────
app.post('/api/coach/hint', async (req) => {
  const { problemStatement, userCode, preflightTC, preflightApproach, hintLevel, prevHints, nvidiaKey } = req.body;

  if (!nvidiaKey) return { hint: null, error: 'No API key. Set your Nvidia NIM key in Settings.' };

  const systemPrompt = `You are a Legendary Grandmaster competitive programming coach.
STRICT RULES:
- You MUST NOT give code
- You MUST NOT give the direct algorithm or solution
- You ask exactly ONE Socratic question (2 sentences max)
- Focus on: invariants, parities, monotonicity, time complexity implications, data structure choice
- Be cold, precise, terse — like a Bloomberg terminal, not a tutor
- Hint level ${hintLevel}/3: ${hintLevel === 1 ? 'very subtle nudge' : hintLevel === 2 ? 'point at the bottleneck' : 'name the exact technique gap'}`;

  const userPrompt = `Problem: ${problemStatement?.substring(0, 800) || 'Not provided'}
My current code: ${userCode?.substring(0, 1200) || 'Not provided'}
My stated approach: ${preflightApproach || 'Not provided'}
My stated time complexity: ${preflightTC || 'Not provided'}
Previous hints this session: ${JSON.stringify(prevHints || [])}
Hint level: ${hintLevel}/3
Give me exactly ONE Socratic question. Do NOT answer it.`;

  try {
    const payload = JSON.stringify({
      model: 'meta/llama-3.1-70b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 150,
      temperature: 0.4,
    });

    const hint = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'integrate.api.nvidia.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nvidiaKey}`,
          'Content-Length': Buffer.byteLength(payload),
        }
      };
      const r = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.choices?.[0]?.message?.content || 'Could not generate hint.');
          } catch { reject(new Error('LLM parse error')); }
        });
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    return { hint, hintLevel };
  } catch (e) {
    return { hint: null, error: e.message };
  }
});

// ── Health ────────────────────────────────────────────────────────────
app.get('/api/health', async () => ({
  status: 'OK',
  problemsInDB: db.prepare('SELECT COUNT(*) as c FROM cf_problems').get().c,
  upsolveTracked: db.prepare('SELECT COUNT(*) as c FROM upsolve_problems').get().c,
  tiltEvents: db.prepare('SELECT COUNT(*) as c FROM tilt_events').get().c,
}));

// ── Start HTTP + WebSocket ────────────────────────────────────────────
let wss;
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  // Attach WebSocket to the underlying raw http.Server Fastify created
  wss = new WebSocketServer({ server: app.server });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Anti Gravity backend live.' }));
  });
  console.log(`\n\x1b[36m[Anti Gravity]\x1b[0m Backend — http://localhost:${PORT}`);
  console.log(`\x1b[36m[Anti Gravity]\x1b[0m WebSocket  — ws://localhost:${PORT}`);
  console.log(`\x1b[36m[Anti Gravity]\x1b[0m Database   — ${DB_PATH}`);
}).catch(err => { console.error(err); process.exit(1); });
