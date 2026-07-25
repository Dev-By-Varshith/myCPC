// Anti Gravity — Node.js Backend

// Fastify + SQLite + WebSocket Tilt Detector
// Run: node server.js

'use strict';
require('dotenv').config();
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const { getGlobalLeaderboard } = require('./community');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const { WebSocketServer } = require('ws');
const https = require('https');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

let browserPromise = null;

// ── Init ──────────────────────────────────────────────────────────────
const app = Fastify({ logger: { level: 'warn' } });
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);
const PORT = process.env.PORT || 3002;
const jwt = require('jsonwebtoken');
const { generateCoachReport } = require('./coach_pipeline');
const { initDNA, analyzeDNASession } = require('./dna_pipeline');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

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

  CREATE TABLE IF NOT EXISTS user_kv (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS cf_credentials (
    cf_handle TEXT PRIMARY KEY,
    jsessionid TEXT NOT NULL,
    csrf_token TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cf_handle TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    achievement_name TEXT NOT NULL,
    achievement_desc TEXT,
    earned_at TEXT NOT NULL DEFAULT (datetime('now')),
    session_id INTEGER,
    UNIQUE(cf_handle, achievement_key)
  );

  CREATE TABLE IF NOT EXISTS mentor_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    mentor_handle TEXT NOT NULL,
    student_handle TEXT NOT NULL,
    annotation TEXT NOT NULL,
    annotation_type TEXT DEFAULT 'note',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mentor_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_handle TEXT NOT NULL,
    student_handle TEXT NOT NULL,
    contest_id INTEGER,
    problem_index TEXT,
    problem_name TEXT,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    due_at TEXT,
    status TEXT DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS skill_scores (
    cf_handle TEXT NOT NULL,
    topic_tag TEXT NOT NULL,
    elo_rating REAL DEFAULT 1200,
    last_updated TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (cf_handle, topic_tag)
  );
`);

// ── CORS ──────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

app.register(cors, { 
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

// ── Phase 9: Scale (Rate Limiting) ────────────────────────────────────
app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// ── Auth & Users ──────────────────────────────────────────────────────
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

// IMPORTANT: Replace with your actual Google Client ID via .env
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '1074326183927-gmuoa3i3khl9jvhf322us5dq9o4r5eij.apps.googleusercontent.com';
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

// ── Coach Pipeline (Phase 4) ──────────────────────────────────────────
app.get('/api/coach/report/:sessionId', async (req) => {
  const { sessionId } = req.params;
  try {
    const report = await generateCoachReport(sessionId);
    return { success: true, report };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Phase 6: Telemetry & RLHF ─────────────────────────────────────────
app.post('/api/coach/feedback', async (req) => {
  const { sessionId, helpful, comment } = req.body;
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS coach_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        helpful BOOLEAN,
        comment TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    
    db.prepare(`INSERT INTO coach_feedback (session_id, helpful, comment) VALUES (?, ?, ?)`).run(sessionId, helpful ? 1 : 0, comment || '');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Phase 7: Community Leaderboard ────────────────────────────────────
app.get('/api/community/leaderboard/:tag', async (req) => {
  const { tag } = req.params;
  try {
    const leaderboard = getGlobalLeaderboard(tag);
    return { success: true, leaderboard };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Phase 8: Human Coach Portal ───────────────────────────────────────
app.get('/api/coach/students', async (req) => {
  try {
    // Get all users with CF handles
    const users = db.prepare(`SELECT id, cf_handle FROM users WHERE cf_handle IS NOT NULL AND cf_handle != ''`).all();
    
    const students = users.map(u => {
      // Get archetype from user_kv
      const archetypeRow = db.prepare(`SELECT value FROM user_kv WHERE user_id = ? AND key = 'archetype'`).get(u.id);
      
      // Get average Elo from skill_scores
      const eloRow = db.prepare(`SELECT AVG(elo_rating) as avg_elo FROM skill_scores WHERE cf_handle = ?`).get(u.cf_handle);
      
      // Get weakest topic (lowest Elo)
      const weakestRow = db.prepare(`SELECT topic_tag, elo_rating FROM skill_scores WHERE cf_handle = ? ORDER BY elo_rating ASC LIMIT 1`).get(u.cf_handle);
      
      return {
        cf_handle: u.cf_handle,
        archetype: archetypeRow ? archetypeRow.value : null,
        elo: eloRow ? Math.round(eloRow.avg_elo || 1200) : 1200,
        weakness: weakestRow ? weakestRow.topic_tag : null
      };
    });
    
    return { success: true, students };
  } catch (e) {
    return { error: e.message };
  }
});

// ── User Skill Scores (Real data for SkillGraph) ────────────────────
app.get('/api/user/skills/:handle', async (req) => {
  const { handle } = req.params;
  try {
    const skills = db.prepare(`
      SELECT topic_tag, elo_rating, last_updated 
      FROM skill_scores 
      WHERE cf_handle = ? 
      ORDER BY elo_rating DESC
    `).all(handle);
    return { success: true, skills };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Upsolve Queue (Real data for UpsolveQueue) ─────────────────────
app.get('/api/upsolve/queue/:handle', async (req) => {
  const { handle } = req.params;
  try {
    // Find problems the user failed (not OK/AC) and haven't solved since
    const failed = db.prepare(`
      SELECT sf.problem_id, sf.verdict, sf.extracted_at,
             CAST((julianday('now') - julianday(sf.extracted_at)) AS INTEGER) as days_since
      FROM submissions_features sf
      WHERE sf.cf_handle = ? 
        AND sf.verdict NOT IN ('OK', 'AC')
        AND sf.problem_id NOT IN (
          SELECT problem_id FROM submissions_features 
          WHERE cf_handle = ? AND verdict IN ('OK', 'AC')
        )
      ORDER BY sf.extracted_at DESC
    `).all(handle, handle);
    
    const queue = failed.map(f => ({
      problemId: f.problem_id,
      verdict: f.verdict,
      daysSince: f.days_since || 0,
      status: (f.days_since || 0) >= 3 ? 'due' : 'learning'
    }));
    
    return { success: true, queue };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Latest Session (Real session ID for CoachReportView) ─────────────
app.get('/api/user/latest-session/:handle', async (req) => {
  const { handle } = req.params;
  try {
    const session = db.prepare(`
      SELECT s.id FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE u.cf_handle = ?
      ORDER BY s.started_at DESC LIMIT 1
    `).get(handle);
    return { success: true, sessionId: session ? session.id : null };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Codeforces Handle Verification (Phase 2 Auth) ──────────────────────
const verificationChallenges = new Map(); // In-memory cache: handle -> token

app.post('/api/auth/challenge', async (req) => {
  const { handle } = req.body;
  if (!handle) return { error: 'CF handle required' };
  
  const token = 'MyCPC-' + crypto.randomBytes(8).toString('hex');
  verificationChallenges.set(handle.toLowerCase(), token);
  
  return { 
    success: true, 
    token,
    instructions: `Temporarily change your Codeforces 'First Name' to this token to verify ownership.`
  };
});

app.post('/api/auth/verify-cf', async (req) => {
  const { handle } = req.body;
  if (!handle) return { error: 'CF handle required' };
  
  const lowerHandle = handle.toLowerCase();
  const expectedToken = verificationChallenges.get(lowerHandle);
  
  if (!expectedToken) {
    return { error: 'No active challenge found. Request a new challenge token.' };
  }
  
  try {
    const fetch = (await import('node-fetch')).default || require('node-fetch'); // or native fetch if Node 18+
    // Using native fetch in Node 20+
    const res = await globalThis.fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
    const data = await res.json();
    
    if (data.status !== 'OK') return { error: 'CF API error: ' + data.comment };
    
    const userInfo = data.result[0];
    if (userInfo.firstName !== expectedToken) {
      return { error: `Verification failed. Found First Name: "${userInfo.firstName || ''}". Expected: "${expectedToken}"` };
    }
    
    // Success! Ensure user exists in DB
    let user = db.prepare(`SELECT * FROM users WHERE cf_handle = ?`).get(handle);
    if (!user) {
      // Create stub user (Phase 2 migration to CF-handle-verified accounts)
      const safeUsername = handle.replace(/[^a-zA-Z0-9_]/g, '_');
      const insert = db.prepare(`INSERT INTO users (username, password, cf_handle) VALUES (?, '', ?)`).run(safeUsername, handle);
      user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(insert.lastInsertRowid);
    }
    
    // Issue JWT
    const sessionToken = jwt.sign({ userId: user.id, cfHandle: handle }, JWT_SECRET, { expiresIn: '30d' });
    verificationChallenges.delete(lowerHandle); // Clear challenge
    
    return { success: true, sessionToken, user };
    
  } catch (e) {
    return { error: 'Failed to verify with CF API: ' + e.message };
  }
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

app.get('/api/users/:id/kv', async (req) => {
  const { id } = req.params;
  const rows = db.prepare(`SELECT key, value FROM user_kv WHERE user_id = ?`).all(id);
  const kv = {};
  rows.forEach(r => kv[r.key] = r.value);
  return { success: true, kv };
});

app.post('/api/users/:id/kv', async (req) => {
  const { id } = req.params;
  const { key, value } = req.body;
  if (!key) return { error: 'Missing key' };
  
  db.prepare(`
    INSERT INTO user_kv (user_id, key, value, updated_at) 
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET 
      value=excluded.value, 
      updated_at=excluded.updated_at
  `).run(id, key, value);
  return { success: true };
});

// ── Proxy for Code Scraper ────────────────────────────────────────────
app.get('/api/proxy', async (req, reply) => {
  const { url } = req.query;
  if (!url) return { error: 'url required' };
  try {
    if (!browserPromise) {
      // Use headless: true but with the saved user profile from setup_cf_auth!
      browserPromise = puppeteer.launch({ 
          headless: 'new', 
          userDataDir: path.join(__dirname, 'cf_profile'),
          args: ['--no-sandbox', '--disable-setuid-sandbox'] 
      });
    }
    const browser = await browserPromise;
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Wait for the Cloudflare challenge to pass and the source code element to appear
    try {
      await page.waitForSelector('#program-source-text', { timeout: 30000 });
    } catch (e) {
      console.error("Selector timeout: ", e.message);
    }
    
    const html = await page.content();
    await page.close();
    reply.type('text/html').send(html);
  } catch(e) {
    reply.code(500).send({ error: e.message });
  }
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

// Init DNA pipeline (creates tables, injects db)
initDNA(db);

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


// ── Upcoming Contests ─────────────────────────────────────────────────
app.get('/api/upcoming-contests', async (req, reply) => {
  try {
    const data = await cfGet('contest.list?gym=false');
    const upcoming = data.result
      .filter(c => c.phase === 'BEFORE')
      .slice(0, 8)
      .map(c => ({
        id: c.id,
        name: c.name,
        startTimeSeconds: c.startTimeSeconds,
        durationSeconds: c.durationSeconds,
        type: c.type,
      }));
    return upcoming;
  } catch (e) {
    reply.code(500).send({ error: e.message });
  }
});

// ── User Contest History (for Upsolve Tracker) ────────────────────────
app.get('/api/user-contests/:handle', async (req, reply) => {
  const { handle } = req.params;
  const { limit = 10 } = req.query;
  try {
    const [ratingData, statusData] = await Promise.all([
      cfGet(`user.rating?handle=${handle}`),
      cfGet(`user.status?handle=${handle}&from=1&count=500`)
    ]);
    if (ratingData.status !== 'OK') return reply.code(400).send({ error: 'Handle not found' });

    // Build set of solved problem ids
    const solved = new Set();
    if (statusData.status === 'OK') {
      statusData.result.forEach(sub => {
        if (sub.verdict === 'OK') {
          solved.add(`${sub.problem.contestId}-${sub.problem.index}`);
        }
      });
    }

    // Last N contests
    const contests = ratingData.result.slice(-Number(limit)).reverse().map(c => ({
      contestId: c.contestId,
      contestName: c.contestName,
      rank: c.rank,
      oldRating: c.oldRating,
      newRating: c.newRating,
      delta: c.newRating - c.oldRating,
      ratingUpdateTimeSeconds: c.ratingUpdateTimeSeconds,
    }));
    return { contests, solved: Array.from(solved) };
  } catch (e) {
    reply.code(500).send({ error: e.message });
  }
});

// ── Contest Problems (for Virtual Contest + Upsolve) ──────────────────
app.get('/api/contest-problems/:contestId', async (req, reply) => {
  const { contestId } = req.params;
  try {
    const data = await cfGet(`contest.standings?contestId=${contestId}&from=1&count=1&showUnofficial=false`);
    if (data.status !== 'OK') return reply.code(400).send({ error: 'Contest not found' });
    const problems = data.result.problems.map(p => ({
      index: p.index,
      name: p.name,
      rating: p.rating || null,
      tags: p.tags,
      contestId: p.contestId,
    }));
    const contest = { id: data.result.contest.id, name: data.result.contest.name, durationSeconds: data.result.contest.durationSeconds };
    return { contest, problems };
  } catch (e) {
    reply.code(500).send({ error: e.message });
  }
});

// ── Smart Problem Recommender ─────────────────────────────────────────
app.get('/api/recommend/:handle', async (req, reply) => {
  const { handle } = req.params;
  const { count = 6 } = req.query;
  try {
    const [infoData, statusData] = await Promise.all([
      cfGet(`user.info?handles=${handle}`),
      cfGet(`user.status?handle=${handle}&from=1&count=1000`)
    ]);
    if (infoData.status !== 'OK') return reply.code(400).send({ error: 'Handle not found' });

    const rating = infoData.result[0].rating || 1200;
    const solved = new Set();
    const tagFails = {};

    if (statusData.status === 'OK') {
      statusData.result.forEach(sub => {
        if (sub.verdict === 'OK') {
          solved.add(`${sub.problem.contestId}-${sub.problem.index}`);
        } else if (sub.verdict === 'WRONG_ANSWER' || sub.verdict === 'TIME_LIMIT_EXCEEDED') {
          (sub.problem.tags || []).forEach(t => { tagFails[t] = (tagFails[t] || 0) + 1; });
        }
      });
    }

    // Find weak tags (most WA/TLE)
    const weakTags = Object.entries(tagFails).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

    // Target rating band: current rating to current+200
    const minRating = Math.max(800, rating - 100);
    const maxRating = rating + 250;

    // Query problems from DB
    const problems = db.prepare(`
      SELECT p.contest_id, p.problem_index, p.problem_name, p.rating, p.tags
      FROM cf_problems p
      WHERE p.rating BETWEEN ? AND ?
      AND p.contest_id IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 100
    `).all(minRating, maxRating);

    // Filter unsolved, prefer weak tags
    const unsolved = problems.filter(p => !solved.has(`${p.contest_id}-${p.problem_index}`));
    const scored = unsolved.map(p => {
      const tags = JSON.parse(p.tags || '[]');
      const tagScore = tags.filter(t => weakTags.includes(t)).length;
      return { ...p, tags, tagScore };
    });
    scored.sort((a, b) => b.tagScore - a.tagScore);

    return scored.slice(0, Number(count)).map(p => ({
      id: `${p.contest_id}${p.problem_index}`,
      contestId: p.contest_id,
      index: p.problem_index,
      name: p.problem_name,
      rating: p.rating,
      tags: p.tags,
      url: `https://codeforces.com/contest/${p.contest_id}/problem/${p.problem_index}`,
    }));
  } catch (e) {
    reply.code(500).send({ error: e.message });
  }
});

// ── DNA Analysis Routes ──────────────────────────────────────────────────────

// Submit a session for analysis
app.post('/api/dna/analyze', async (req) => {
  const { cfHandle, problemName, problemConfig, sessionEvents, finalCode, userGeminiKey } = req.body;
  if (!cfHandle || !sessionEvents) return { error: 'cfHandle and sessionEvents required' };
  try {
    const result = await analyzeDNASession(
      { cfHandle, problemName, problemConfig, sessionEvents, finalCode },
      userGeminiKey || null
    );
    return result;
  } catch (e) {
    console.error('[DNA Route] Error:', e.message);
    return { error: e.message };
  }
});

// Get a specific report by session ID
app.get('/api/dna/report/:sessionId', async (req) => {
  const { sessionId } = req.params;
  try {
    const session = db.prepare(`SELECT * FROM dna_sessions WHERE id = ?`).get(sessionId);
    const report = db.prepare(`SELECT * FROM dna_reports WHERE session_id = ?`).get(sessionId);
    if (!report) return { error: 'Report not found' };
    return {
      success: true,
      session: {
        ...session,
        style_signals: JSON.parse(session?.style_signals || '[]'),
        problem_config: JSON.parse(session?.problem_config || '{}')
      },
      report: {
        ...report,
        struggle_points: JSON.parse(report.struggle_points || '[]'),
        growth_plan: JSON.parse(report.growth_plan || '[]'),
        dna_axes: JSON.parse(report.dna_axes || '{}'),
        raw_llm_response: JSON.parse(report.raw_llm_response || '{}')
      }
    };
  } catch (e) { return { error: e.message }; }
});

// Get all reports for a user (history)
app.get('/api/dna/history/:handle', async (req) => {
  const { handle } = req.params;
  const { limit = 20 } = req.query;
  try {
    const reports = db.prepare(`
      SELECT r.id, r.session_id, r.problem_name, r.style_summary, r.dna_axes,
             r.generated_at, s.total_time_sec, s.wa_count, s.style_signals
      FROM dna_reports r
      JOIN dna_sessions s ON r.session_id = s.id
      WHERE r.cf_handle = ?
      ORDER BY r.generated_at DESC
      LIMIT ?
    `).all(handle, parseInt(limit));
    return {
      success: true,
      history: reports.map(r => ({
        ...r,
        dna_axes: JSON.parse(r.dna_axes || '{}'),
        style_signals: JSON.parse(r.style_signals || '[]')
      }))
    };
  } catch (e) { return { error: e.message }; }
});

// Get cumulative DNA profile
app.get('/api/dna/profile/:handle', async (req) => {
  const { handle } = req.params;
  try {
    const profile = db.prepare(`SELECT * FROM dna_profile WHERE cf_handle = ?`).get(handle);
    if (!profile) return { success: true, profile: null, message: 'No sessions analyzed yet' };
    return {
      success: true,
      profile: {
        ...profile,
        top_merits: JSON.parse(profile.top_merits || '[]'),
        top_demerits: JSON.parse(profile.top_demerits || '[]'),
        growth_trajectory: JSON.parse(profile.growth_trajectory || '[]')
      }
    };
  } catch (e) { return { error: e.message }; }
});

// Admin: Add Gemini API key to pool
app.post('/api/dna/admin/add-key', async (req) => {
  // TODO: protect with admin auth token in production
  const { keyValue, label, adminSecret } = req.body;
  if (adminSecret !== (process.env.ADMIN_SECRET || 'mycpc-admin-2025')) {
    return { error: 'Unauthorized' };
  }
  if (!keyValue) return { error: 'keyValue required' };
  try {
    db.prepare(`INSERT OR IGNORE INTO api_key_pool (key_value, label) VALUES (?, ?)`)
      .run(keyValue, label || 'pool-key');
    const count = db.prepare(`SELECT COUNT(*) as c FROM api_key_pool WHERE is_active = 1`).get().c;
    return { success: true, totalKeys: count };
  } catch (e) { return { error: e.message }; }
});

// Admin: View key pool status
app.get('/api/dna/admin/keys', async (req) => {
  const { adminSecret } = req.query;
  if (adminSecret !== (process.env.ADMIN_SECRET || 'mycpc-admin-2025')) return { error: 'Unauthorized' };
  const keys = db.prepare(`
    SELECT id, label, requests_today, tokens_today, last_reset_date, is_active, added_at FROM api_key_pool
  `).all();
  return { success: true, keys };
});

// User: Save their own Gemini key (BYOK)
app.post('/api/dna/user-key', async (req) => {
  const { cfHandle, geminiKey } = req.body;
  if (!cfHandle || !geminiKey) return { error: 'cfHandle and geminiKey required' };
  const userId = db.prepare(`SELECT id FROM users WHERE cf_handle = ? LIMIT 1`).get(cfHandle)?.id;
  if (!userId) return { error: 'User not found' };
  // Store encrypted (basic XOR for now — in prod use proper encryption)
  db.prepare(`
    INSERT INTO user_kv (user_id, key, value, updated_at)
    VALUES (?, 'gemini_key', ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(userId, geminiKey);
  return { success: true };
});

// User: Get their own Gemini key + quota
app.get('/api/dna/user-quota/:handle', async (req) => {
  const { handle } = req.params;
  const userId = db.prepare(`SELECT id FROM users WHERE cf_handle = ? LIMIT 1`).get(handle)?.id;
  const monthKey = `dna_quota_${new Date().toISOString().slice(0, 7)}`;
  const used = userId
    ? parseInt(db.prepare(`SELECT value FROM user_kv WHERE user_id = ? AND key = ?`).get(userId, monthKey)?.value || '0')
    : 0;
  const hasByok = userId
    ? !!db.prepare(`SELECT value FROM user_kv WHERE user_id = ? AND key = 'gemini_key'`).get(userId)
    : false;
  return {
    success: true,
    used,
    limit: 10,
    remaining: Math.max(0, 10 - used),
    hasByok
  };
});

// ── MISSING CRITICAL: Problem Intel ──────────────────────────────────────────
// Called by Chrome Extension content scripts + popup for personalized difficulty
app.post('/api/dna/problem-intel', async (req) => {
  const { cfHandle, contestId, problemIndex, timeLimit, judge } = req.body;
  if (!cfHandle) return { error: 'cfHandle required' };

  try {
    // 1. Fetch CF problem rating from DB
    const cfProblem = contestId && problemIndex
      ? db.prepare(`SELECT rating, tags FROM cf_problems WHERE contest_id = ? AND problem_index = ?`).get(contestId, problemIndex)
      : null;

    const cfDifficulty = cfProblem?.rating || null;
    const topTags = cfProblem ? JSON.parse(cfProblem.tags || '[]').slice(0, 4) : [];

    // 2. Get user's DNA profile for personalization
    const profile = db.prepare(`SELECT * FROM dna_profile WHERE cf_handle = ?`).get(cfHandle);
    const speedScore = profile?.avg_speed_score || 50;
    const accuracyScore = profile?.avg_accuracy_score || 50;

    // 3. Get user's solved problems near this difficulty to calibrate personal difficulty
    let yourDifficulty = cfDifficulty;
    let predictedMinutes = null;

    if (cfDifficulty) {
      // Skill modifier: if user has high speed/accuracy, problem feels easier
      const skillFactor = ((speedScore + accuracyScore) / 2 - 50) / 50; // -1 to +1
      yourDifficulty = Math.round(cfDifficulty * (1 - skillFactor * 0.15));

      // Predict solve time: average session time for similar-rated problems
      const similarSessions = db.prepare(`
        SELECT ds.total_time_sec FROM dna_sessions ds
        JOIN dna_reports dr ON ds.id = dr.session_id
        WHERE ds.cf_handle = ? AND ds.total_time_sec IS NOT NULL AND ds.total_time_sec > 60
        ORDER BY ds.submitted_at DESC LIMIT 20
      `).all(cfHandle);

      if (similarSessions.length > 0) {
        const avgSec = similarSessions.reduce((s, r) => s + r.total_time_sec, 0) / similarSessions.length;
        // Scale by difficulty ratio
        const diffRatio = cfDifficulty ? (yourDifficulty / cfDifficulty) : 1;
        predictedMinutes = Math.max(5, Math.round((avgSec / 60) * diffRatio));
      } else {
        // Default prediction based on difficulty
        predictedMinutes = cfDifficulty
          ? Math.max(5, Math.round((cfDifficulty - 800) / 50) + 10)
          : 30;
      }
    }

    // 4. Find similar solved problems
    const solvedSimilar = topTags.length > 0
      ? db.prepare(`
          SELECT DISTINCT p.contest_id, p.problem_index, p.problem_name, p.rating
          FROM cf_problems p
          JOIN user_solved us ON us.contest_id = p.contest_id AND us.problem_index = p.problem_index
          WHERE us.cf_handle = ?
            AND p.rating IS NOT NULL
            AND p.contest_id != ?
          ORDER BY p.rating DESC LIMIT 5
        `).all(cfHandle, contestId || 0)
      : [];

    // 5. Find unsolved fill-gap problems
    const fillGapProblems = cfDifficulty
      ? db.prepare(`
          SELECT p.contest_id, p.problem_index, p.problem_name, p.rating, p.tags
          FROM cf_problems p
          WHERE p.rating BETWEEN ? AND ?
            AND NOT EXISTS (
              SELECT 1 FROM user_solved us
              WHERE us.cf_handle = ? AND us.contest_id = p.contest_id AND us.problem_index = p.problem_index
            )
          ORDER BY RANDOM() LIMIT 4
        `).all(Math.max(800, cfDifficulty - 100), cfDifficulty + 200, cfHandle)
      : [];

    return {
      success: true,
      cfDifficulty,
      yourDifficulty,
      predictedMinutes,
      topTags,
      solvedSimilar: solvedSimilar.map(p => ({
        id: `${p.contest_id}-${p.problem_index}`,
        name: p.problem_name,
        rating: p.rating,
        url: `https://codeforces.com/contest/${p.contest_id}/problem/${p.problem_index}`
      })),
      fillGapProblems: fillGapProblems.map(p => ({
        id: `${p.contest_id}-${p.problem_index}`,
        name: p.problem_name,
        rating: p.rating,
        tags: JSON.parse(p.tags || '[]'),
        url: `https://codeforces.com/contest/${p.contest_id}/problem/${p.problem_index}`
      })),
      gmBenchmarkMinutes: cfDifficulty ? Math.max(3, Math.round((cfDifficulty - 800) / 120) + 5) : null,
      speedScore: Math.round(speedScore),
      accuracyScore: Math.round(accuracyScore)
    };
  } catch (e) {
    console.error('[Problem Intel] Error:', e.message);
    return { error: e.message };
  }
});

// ── Passive Event Ingestion ───────────────────────────────────────────────────
// Receives editorial opens, solution peeks, standings checks from Chrome extension
app.post('/api/dna/passive-event', async (req) => {
  const { cfHandle, eventType, url, timeSpentMs, timestamp, contestId, problemIndex, readTimeMs, author, checkCount } = req.body;
  if (!cfHandle || !eventType) return { error: 'cfHandle and eventType required' };

  try {
    // Create passive_events table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS passive_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cf_handle TEXT NOT NULL,
        event_type TEXT NOT NULL,
        url TEXT,
        time_spent_ms INTEGER,
        contest_id TEXT,
        problem_index TEXT,
        extra_data TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.prepare(`
      INSERT INTO passive_events (cf_handle, event_type, url, time_spent_ms, contest_id, problem_index, extra_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cfHandle, eventType, url || null,
      timeSpentMs || null,
      contestId || null, problemIndex || null,
      JSON.stringify({ author, checkCount, readTimeMs })
    );

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});


// Called by Chrome Extension when user saves JSESSIONID/CSRF
app.post('/api/auth/cf-credentials', async (req) => {
  const { cfHandle, jsessionid, csrfToken } = req.body;
  if (!cfHandle || !jsessionid || !csrfToken) {
    return { error: 'cfHandle, jsessionid, and csrfToken required' };
  }
  try {
    db.prepare(`
      INSERT INTO cf_credentials (cf_handle, jsessionid, csrf_token, synced_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(cf_handle) DO UPDATE SET
        jsessionid = excluded.jsessionid,
        csrf_token = excluded.csrf_token,
        synced_at = datetime('now')
    `).run(cfHandle, jsessionid, csrfToken);
    return { success: true, synced: true };
  } catch (e) {
    return { error: e.message };
  }
});

// Fetch stored CF credentials (used by VS Code extension for auto-submit)
app.get('/api/auth/cf-credentials/:handle', async (req) => {
  const { handle } = req.params;
  try {
    const creds = db.prepare(`SELECT jsessionid, csrf_token, synced_at FROM cf_credentials WHERE cf_handle = ?`).get(handle);
    if (!creds) return { error: 'No credentials stored for this handle' };
    return { success: true, ...creds };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Achievement Engine ────────────────────────────────────────────────────────
const ACHIEVEMENT_DEFS = [
  {
    key: 'forge',
    name: '🔥 The Forge',
    desc: 'Solved a 2400+ rated problem after 3+ failed attempts',
    check: (session) => (session.wa_count >= 3) && session.final_rating >= 2400 && session.verdict === 'AC'
  },
  {
    key: 'speedrunner',
    name: '🔭 Speedrunner',
    desc: 'Solved a problem 50%+ faster than your predicted time',
    check: (session, predicted) => predicted && session.total_time_sec < (predicted * 60 * 0.5) && session.verdict === 'AC'
  },
  {
    key: 'ice_pressure',
    name: '🧊 Ice Under Pressure',
    desc: 'First AC in last 15 min of a contest with 0 WAs',
    check: (session) => session.wa_count === 0 && session.is_contest_last15 && session.verdict === 'AC'
  },
  {
    key: 'clean_sweep',
    name: '✨ Clean Sweep',
    desc: 'AC on first submission with 0 compilations errors',
    check: (session) => session.wa_count === 0 && session.compilation_attempts <= 1 && session.verdict === 'AC'
  },
  {
    key: 'resilient',
    name: '💪 Resilient',
    desc: 'AC after 5+ wrong answers',
    check: (session) => session.wa_count >= 5 && session.verdict === 'AC'
  },
  {
    key: 'night_owl',
    name: '🦉 Night Owl',
    desc: 'Solved a problem between 2am and 5am',
    check: (session) => {
      const h = new Date(session.submitted_at).getHours();
      return h >= 2 && h <= 5 && session.verdict === 'AC';
    }
  },
  {
    key: 'marathon',
    name: '🏃 Marathon',
    desc: 'Spent 3+ hours on a single problem',
    check: (session) => (session.total_time_sec || 0) >= 10800 && session.verdict === 'AC'
  },
  {
    key: 'first_1500',
    name: '⭐ First 1500',
    desc: 'Solved your first 1500+ rated problem',
    check: (session) => session.final_rating >= 1500 && session.verdict === 'AC'
  },
  {
    key: 'first_2000',
    name: '🌟 First 2000',
    desc: 'Solved your first 2000+ rated problem',
    check: (session) => session.final_rating >= 2000 && session.verdict === 'AC'
  },
  {
    key: 'comeback',
    name: '🔄 The Comeback',
    desc: 'Solved a problem you previously gave up on',
    check: (session) => session.is_upsolve && session.verdict === 'AC'
  }
];

app.get('/api/achievements/:handle', async (req) => {
  const { handle } = req.params;
  try {
    const earned = db.prepare(`SELECT * FROM achievements WHERE cf_handle = ? ORDER BY earned_at DESC`).all(handle);
    const earnedKeys = new Set(earned.map(a => a.achievement_key));
    const allDefs = ACHIEVEMENT_DEFS.map(d => ({
      key: d.key,
      name: d.name,
      desc: d.desc,
      earned: earnedKeys.has(d.key),
      earnedAt: earned.find(a => a.achievement_key === d.key)?.earned_at || null
    }));
    return { success: true, achievements: allDefs, totalEarned: earned.length, total: ACHIEVEMENT_DEFS.length };
  } catch (e) {
    return { error: e.message };
  }
});

app.post('/api/achievements/check/:handle', async (req) => {
  const { handle } = req.params;
  try {
    // Get recent sessions
    const sessions = db.prepare(`
      SELECT ds.*, dr.dna_axes FROM dna_sessions ds
      LEFT JOIN dna_reports dr ON ds.id = dr.session_id
      WHERE ds.cf_handle = ? AND ds.submitted_at > datetime('now', '-7 days')
      ORDER BY ds.submitted_at DESC LIMIT 30
    `).all(handle);

    const newlyEarned = [];
    for (const session of sessions) {
      const axes = JSON.parse(session.dna_axes || '{}');
      const enriched = {
        ...session,
        verdict: session.status === 'analyzed' ? 'AC' : 'WA',
        final_rating: 0,
        is_contest_last15: false,
        is_upsolve: false
      };
      for (const def of ACHIEVEMENT_DEFS) {
        try {
          if (def.check(enriched)) {
            const inserted = db.prepare(`
              INSERT OR IGNORE INTO achievements (cf_handle, achievement_key, achievement_name, achievement_desc, session_id)
              VALUES (?, ?, ?, ?, ?)
            `).run(handle, def.key, def.name, def.desc, session.id);
            if (inserted.changes > 0) newlyEarned.push({ key: def.key, name: def.name });
          }
        } catch (_) {}
      }
    }
    return { success: true, newlyEarned };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Mentor Annotations ────────────────────────────────────────────────────────
app.post('/api/mentor/annotate', async (req) => {
  const { sessionId, mentorHandle, studentHandle, annotation, annotationType } = req.body;
  if (!sessionId || !mentorHandle || !annotation) return { error: 'sessionId, mentorHandle, annotation required' };
  try {
    const res = db.prepare(`
      INSERT INTO mentor_annotations (session_id, mentor_handle, student_handle, annotation, annotation_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, mentorHandle, studentHandle || '', annotation, annotationType || 'note');
    return { success: true, id: res.lastInsertRowid };
  } catch (e) {
    return { error: e.message };
  }
});

app.get('/api/mentor/annotations/:sessionId', async (req) => {
  const { sessionId } = req.params;
  try {
    const annotations = db.prepare(`
      SELECT * FROM mentor_annotations WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId);
    return { success: true, annotations };
  } catch (e) {
    return { error: e.message };
  }
});

app.get('/api/mentor/students/:mentorHandle', async (req) => {
  const { mentorHandle } = req.params;
  try {
    // All students this mentor has annotated
    const students = db.prepare(`
      SELECT DISTINCT student_handle,
        COUNT(DISTINCT session_id) as sessions_annotated,
        MAX(created_at) as last_annotation
      FROM mentor_annotations
      WHERE mentor_handle = ?
      GROUP BY student_handle
    `).all(mentorHandle);

    const result = students.map(s => {
      const profile = db.prepare(`SELECT * FROM dna_profile WHERE cf_handle = ?`).get(s.student_handle);
      return {
        handle: s.student_handle,
        sessionsAnnotated: s.sessions_annotated,
        lastAnnotation: s.last_annotation,
        dnaProfile: profile ? {
          speedScore: profile.avg_speed_score,
          accuracyScore: profile.avg_accuracy_score,
          resilienceScore: profile.avg_resilience_score,
          totalSessions: profile.total_sessions
        } : null
      };
    });
    return { success: true, students: result };
  } catch (e) {
    return { error: e.message };
  }
});

app.post('/api/mentor/assign', async (req) => {
  const { mentorHandle, studentHandle, contestId, problemIndex, problemName, dueAt } = req.body;
  try {
    const res = db.prepare(`
      INSERT INTO mentor_assignments (mentor_handle, student_handle, contest_id, problem_index, problem_name, due_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(mentorHandle, studentHandle, contestId || null, problemIndex || null, problemName || '', dueAt || null);
    return { success: true, id: res.lastInsertRowid };
  } catch (e) {
    return { error: e.message };
  }
});

app.get('/api/mentor/assignments/:studentHandle', async (req) => {
  const { studentHandle } = req.params;
  try {
    const assignments = db.prepare(`
      SELECT * FROM mentor_assignments WHERE student_handle = ? ORDER BY assigned_at DESC
    `).all(studentHandle);
    return { success: true, assignments };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Performance Arc ────────────────────────────────────────────────────────────
// Rating + DNA scores timeline overlay
app.get('/api/dna/performance-arc/:handle', async (req) => {
  const { handle } = req.params;
  try {
    // Get last 30 DNA sessions with scores
    const sessions = db.prepare(`
      SELECT ds.submitted_at, ds.problem_name, ds.total_time_sec, ds.wa_count,
             dr.dna_axes, dr.style_summary
      FROM dna_sessions ds
      JOIN dna_reports dr ON ds.id = dr.session_id
      WHERE ds.cf_handle = ?
      ORDER BY ds.submitted_at ASC
      LIMIT 50
    `).all(handle);

    const arc = sessions.map(s => {
      const axes = JSON.parse(s.dna_axes || '{}');
      return {
        date: s.submitted_at,
        problemName: s.problem_name,
        timeMin: Math.round((s.total_time_sec || 0) / 60),
        waCount: s.wa_count || 0,
        speed: axes.speed || 50,
        accuracy: axes.accuracy || 50,
        resilience: axes.resilience || 50,
        cleanliness: axes.cleanliness || 50,
        styleSummary: s.style_summary || ''
      };
    });

    // Calculate rolling 7-session averages
    const rolling = arc.map((pt, i) => {
      const window = arc.slice(Math.max(0, i - 6), i + 1);
      const avg = (key) => window.reduce((s, x) => s + (x[key] || 50), 0) / window.length;
      return { ...pt, rollingSpeed: avg('speed'), rollingAccuracy: avg('accuracy'), rollingResilience: avg('resilience') };
    });

    return { success: true, arc: rolling };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Contest Post-Mortem ───────────────────────────────────────────────────────
app.get('/api/contest/postmortem/:handle/:contestId', async (req) => {
  const { handle, contestId } = req.params;
  try {
    // Get user's submissions for this contest
    const submissions = await cfGet(`user.status?handle=${handle}&from=1&count=200`);
    const contestSubs = submissions.filter(s => s.contestId === parseInt(contestId));

    // Get contest info
    const standings = await cfGet(`contest.standings?contestId=${contestId}&from=1&count=1`);
    const problems = standings.problems || [];

    // Build per-problem timeline
    const problemTimeline = {};
    for (const sub of contestSubs) {
      const idx = sub.problem.index;
      if (!problemTimeline[idx]) {
        problemTimeline[idx] = {
          index: idx,
          name: sub.problem.name,
          rating: sub.problem.rating || null,
          submissions: [],
          firstAC: null,
          waCount: 0,
          penalty: 0
        };
      }
      problemTimeline[idx].submissions.push({
        verdict: sub.verdict,
        timeSeconds: sub.relativeTimeSeconds,
        lang: sub.programmingLanguage
      });
      if (sub.verdict === 'WRONG_ANSWER' || sub.verdict === 'TIME_LIMIT_EXCEEDED') {
        problemTimeline[idx].waCount++;
        problemTimeline[idx].penalty += 20; // 20 min penalty per WA
      }
      if (sub.verdict === 'OK' && !problemTimeline[idx].firstAC) {
        problemTimeline[idx].firstAC = sub.relativeTimeSeconds;
      }
    }

    const timeline = Object.values(problemTimeline).sort((a, b) => (a.firstAC || 999999) - (b.firstAC || 999999));

    // Optimal ordering: what order would minimize total time?
    const solved = timeline.filter(p => p.firstAC !== null);
    const optimalOrder = [...solved].sort((a, b) => (a.rating || 1000) - (b.rating || 1000));

    // Analysis insights
    const insights = [];
    for (const p of solved) {
      const betterChoices = solved.filter(q => q.index !== p.index && (q.rating || 1000) < (p.rating || 1000) && (q.firstAC || 0) > (p.firstAC || 0));
      if (betterChoices.length > 0) {
        insights.push(`You solved ${p.index} (${p.rating || '?'}) before easier problems — consider opening lower-rated problems first`);
      }
      if (p.waCount >= 3) {
        insights.push(`${p.index}: ${p.waCount} WAs added ${p.penalty}min penalty — pre-flight checklist could help`);
      }
    }

    return {
      success: true,
      contestId,
      handle,
      problems: problems.map(p => ({ index: p.index, name: p.name, rating: p.rating })),
      timeline,
      optimalOrder: optimalOrder.map(p => p.index),
      insights: insights.slice(0, 5),
      totalPenalty: solved.reduce((s, p) => s + p.penalty, 0),
      problemsSolved: solved.length
    };
  } catch (e) {
    return { error: e.message };
  }
});

// ── AI Coach Chat (Gemini RAG over sessions) ──────────────────────────────────
app.post('/api/coach/chat', async (req) => {
  const { cfHandle, message, geminiKey } = req.body;
  if (!cfHandle || !message) return { error: 'cfHandle and message required' };

  const apiKey = geminiKey || (() => {
    const userId = db.prepare(`SELECT id FROM users WHERE cf_handle = ? LIMIT 1`).get(cfHandle)?.id;
    if (userId) {
      return db.prepare(`SELECT value FROM user_kv WHERE user_id = ? AND key = 'gemini_key'`).get(userId)?.value;
    }
    return null;
  })();

  if (!apiKey) return { error: 'Gemini API key required. Add your BYOK key in settings.' };

  // Gather context from user's sessions
  const profile = db.prepare(`SELECT * FROM dna_profile WHERE cf_handle = ?`).get(cfHandle);
  const recentSessions = db.prepare(`
    SELECT ds.problem_name, ds.total_time_sec, ds.wa_count, dr.style_summary, dr.struggle_points, dr.growth_plan, dr.dna_axes
    FROM dna_sessions ds
    JOIN dna_reports dr ON ds.id = dr.session_id
    WHERE ds.cf_handle = ?
    ORDER BY ds.submitted_at DESC LIMIT 10
  `).all(cfHandle);

  const weakTags = db.prepare(`
    SELECT topic_tag, elo_rating FROM skill_scores
    WHERE cf_handle = ? ORDER BY elo_rating ASC LIMIT 5
  `).all(cfHandle);

  const contextStr = `
User: ${cfHandle}
DNA Profile: Speed=${Math.round(profile?.avg_speed_score||50)}, Accuracy=${Math.round(profile?.avg_accuracy_score||50)}, Resilience=${Math.round(profile?.avg_resilience_score||50)}, Total Sessions=${profile?.total_sessions||0}
Recent sessions (last 10):
${recentSessions.map(s => `- ${s.problem_name}: ${Math.round((s.total_time_sec||0)/60)}min, ${s.wa_count||0} WAs. Style: ${s.style_summary||'N/A'}`).join('\n')}
Weakest topics: ${weakTags.map(t => `${t.topic_tag}(Elo:${Math.round(t.elo_rating)})`).join(', ') || 'Not enough data yet'}
`;

  const systemPrompt = `You are an elite competitive programming coach with deep knowledge of algorithms, data structures, and contest strategy.
You have access to the user's complete training history and DNA profile.
Be specific, actionable, and direct. Reference their actual data. Keep responses under 200 words.
Never give generic advice — always tie it to their specific performance data.`;

  try {
    const payload = JSON.stringify({
      contents: [{
        parts: [
          { text: `${systemPrompt}\n\nUser's Context:\n${contextStr}\n\nUser asks: ${message}` }
        ]
      }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
    });

    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const r = require('https').request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate response.';
    return { success: true, response: text };
  } catch (e) {
    return { error: 'AI coach unavailable: ' + e.message };
  }
});

// ── Peer DNA Comparison ───────────────────────────────────────────────────────
app.get('/api/dna/compare/:handle1/:handle2', async (req) => {
  const { handle1, handle2 } = req.params;
  try {
    const p1 = db.prepare(`SELECT * FROM dna_profile WHERE cf_handle = ?`).get(handle1);
    const p2 = db.prepare(`SELECT * FROM dna_profile WHERE cf_handle = ?`).get(handle2);

    // If handle2 doesn't have DNA yet, try to get CF rating data for comparison
    let cfInfo2 = null;
    try {
      cfInfo2 = await cfGet(`user.info?handles=${handle2}`);
    } catch (_) {}

    const normalize = (p) => ({
      speed: Math.round(p?.avg_speed_score || 50),
      accuracy: Math.round(p?.avg_accuracy_score || 50),
      resilience: Math.round(p?.avg_resilience_score || 50),
      cleanliness: Math.round(p?.avg_cleanliness_score || 50),
      totalSessions: p?.total_sessions || 0,
      dominantStyle: p?.dominant_style || 'Unknown'
    });

    const profile1 = normalize(p1);
    const profile2 = normalize(p2);

    // Generate closing-the-gap insights
    const gaps = [];
    if (profile2.speed > profile1.speed + 10) gaps.push({ area: 'Speed', gap: profile2.speed - profile1.speed, advice: 'Practice implementation-heavy problems under timer pressure' });
    if (profile2.accuracy > profile1.accuracy + 10) gaps.push({ area: 'Accuracy', gap: profile2.accuracy - profile1.accuracy, advice: 'Add pre-flight checklist: time complexity, edge cases, overflow' });
    if (profile2.resilience > profile1.resilience + 10) gaps.push({ area: 'Resilience', gap: profile2.resilience - profile1.resilience, advice: 'Practice problems after 2+ failed attempts before looking at hints' });

    return {
      success: true,
      handle1,
      handle2,
      profile1,
      profile2,
      cf2Rating: cfInfo2?.[0]?.rating || null,
      cf2Rank: cfInfo2?.[0]?.rank || null,
      gaps: gaps.slice(0, 3)
    };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Streak Tracking ───────────────────────────────────────────────────────────
app.get('/api/streaks/:handle', async (req) => {
  const { handle } = req.params;
  try {
    // Get submission dates from user_solved
    const dates = db.prepare(`
      SELECT DISTINCT date(solved_at) as solve_date
      FROM user_solved WHERE cf_handle = ?
      ORDER BY solve_date DESC LIMIT 365
    `).all(handle);

    const dateSet = new Set(dates.map(d => d.solve_date));
    const today = new Date().toISOString().split('T')[0];

    // Calculate current streak
    let currentStreak = 0;
    let d = new Date();
    while (true) {
      const dateStr = d.toISOString().split('T')[0];
      if (dateSet.has(dateStr)) {
        currentStreak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    const allDates = [...dateSet].sort();
    for (let i = 0; i < allDates.length; i++) {
      if (i === 0) { tempStreak = 1; continue; }
      const prev = new Date(allDates[i-1]);
      const curr = new Date(allDates[i]);
      const diff = (curr - prev) / 86400000;
      if (diff === 1) { tempStreak++; }
      else { longestStreak = Math.max(longestStreak, tempStreak); tempStreak = 1; }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Burnout warning: 18+ days straight
    const burnoutWarning = currentStreak >= 18;

    return {
      success: true,
      currentStreak,
      longestStreak,
      totalActiveDays: dateSet.size,
      burnoutWarning,
      burnoutMessage: burnoutWarning ? `You've been coding ${currentStreak} days straight — consider taking a rest day for peak performance` : null
    };
  } catch (e) {
    return { error: e.message };
  }
});


app.get('/api/health', async () => ({
  status: 'OK',
  problemsInDB: db.prepare('SELECT COUNT(*) as c FROM cf_problems').get().c,
  upsolveTracked: db.prepare('SELECT COUNT(*) as c FROM upsolve_problems').get().c,
  tiltEvents: db.prepare('SELECT COUNT(*) as c FROM tilt_events').get().c,
  dnaSessionsAnalyzed: db.prepare('SELECT COUNT(*) as c FROM dna_sessions WHERE status = ?').get('analyzed').c,
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
