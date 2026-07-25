'use strict';
/**
 * myCPC — Coder DNA Analysis Pipeline
 * 
 * Handles:
 *  1. API Key Pool rotation (round-robin across N keys)
 *  2. Per-user quota enforcement (free tier: 10/month)
 *  3. Gemini Flash prompt engineering
 *  4. Structured report parsing
 */

const https = require('https');

// ── Key Pool Management ──────────────────────────────────────────────────────
let db; // injected by server.js

function initDNA(_db) {
  db = _db;

  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_key_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT UNIQUE NOT NULL,
      label TEXT,
      requests_today INTEGER DEFAULT 0,
      tokens_today INTEGER DEFAULT 0,
      last_reset_date TEXT DEFAULT (date('now')),
      is_active INTEGER DEFAULT 1,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dna_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cf_handle TEXT NOT NULL,
      problem_name TEXT NOT NULL,
      problem_config TEXT,
      session_events TEXT NOT NULL,
      final_code TEXT,
      total_time_sec INTEGER,
      compilation_attempts INTEGER DEFAULT 0,
      wa_count INTEGER DEFAULT 0,
      tle_count INTEGER DEFAULT 0,
      rewrite_count INTEGER DEFAULT 0,
      hesitation_count INTEGER DEFAULT 0,
      style_signals TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      submitted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dna_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER UNIQUE REFERENCES dna_sessions(id),
      cf_handle TEXT NOT NULL,
      problem_name TEXT,
      style_summary TEXT,
      struggle_points TEXT,
      pivot_analysis TEXT,
      growth_plan TEXT,
      dna_axes TEXT,
      raw_llm_response TEXT,
      llm_model TEXT DEFAULT 'gemini-1.5-flash',
      tokens_used INTEGER DEFAULT 0,
      generated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dna_profile (
      cf_handle TEXT PRIMARY KEY,
      total_sessions INTEGER DEFAULT 0,
      avg_speed_score REAL DEFAULT 50,
      avg_accuracy_score REAL DEFAULT 50,
      avg_cleanliness_score REAL DEFAULT 50,
      avg_resilience_score REAL DEFAULT 50,
      dominant_style TEXT,
      top_merits TEXT DEFAULT '[]',
      top_demerits TEXT DEFAULT '[]',
      growth_trajectory TEXT DEFAULT '[]',
      last_updated TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('[DNA] Pipeline initialized.');
}

// ── Key Pool: Select best key ────────────────────────────────────────────────
function selectKey(userProvidedKey) {
  if (userProvidedKey) return { keyValue: userProvidedKey, poolId: null };

  // Reset daily counters if needed
  db.prepare(`
    UPDATE api_key_pool 
    SET requests_today = 0, tokens_today = 0, last_reset_date = date('now')
    WHERE last_reset_date < date('now') AND is_active = 1
  `).run();

  // Pick key with lowest requests today (round-robin with lowest load)
  const key = db.prepare(`
    SELECT id, key_value, requests_today
    FROM api_key_pool
    WHERE is_active = 1 AND requests_today < 1400
    ORDER BY requests_today ASC
    LIMIT 1
  `).get();

  if (!key) return null; // All keys exhausted for today
  return { keyValue: key.key_value, poolId: key.id };
}

function incrementKeyUsage(poolId, tokensUsed) {
  if (!poolId) return;
  db.prepare(`
    UPDATE api_key_pool 
    SET requests_today = requests_today + 1, tokens_today = tokens_today + ?
    WHERE id = ?
  `).run(tokensUsed || 0, poolId);
}

// ── User Quota Check ─────────────────────────────────────────────────────────
const FREE_MONTHLY_LIMIT = 10;

function checkAndDecrementQuota(cfHandle, userOwnKey) {
  if (userOwnKey) return { allowed: true, remaining: 999 }; // BYOK = unlimited

  const monthKey = `dna_quota_${new Date().toISOString().slice(0, 7)}`; // "2025-07"
  const row = db.prepare(`
    SELECT value FROM user_kv 
    WHERE key = ? AND user_id = (SELECT id FROM users WHERE cf_handle = ? LIMIT 1)
  `).get(monthKey, cfHandle);

  const used = row ? parseInt(row.value) : 0;
  const remaining = FREE_MONTHLY_LIMIT - used;

  if (remaining <= 0) return { allowed: false, remaining: 0 };

  // Decrement
  const userId = db.prepare(`SELECT id FROM users WHERE cf_handle = ? LIMIT 1`).get(cfHandle)?.id;
  if (userId) {
    db.prepare(`
      INSERT INTO user_kv (user_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')
    `).run(userId, monthKey, '1');
  }

  return { allowed: true, remaining: remaining - 1 };
}

// ── Heuristic Style Analyzer ─────────────────────────────────────────────────
function analyzeSessionHeuristics(events) {
  const signals = new Set();
  let hesitationCount = 0;
  let rewriteCount = 0;
  let waCount = 0;
  let tleCount = 0;
  let compilationAttempts = 0;

  const edits = events.filter(e => e.event === 'edit').sort((a, b) => a.timestamp - b.timestamp);
  const testRuns = events.filter(e => e.event === 'test_run');
  const testResults = events.filter(e => e.event === 'test_result');
  const codeLengths = edits.map(e => e.code_length).filter(Boolean);

  compilationAttempts = testRuns.length;

  // Hesitation detection (gaps > 2 min between edits)
  for (let i = 1; i < edits.length; i++) {
    const gapSec = (edits[i].timestamp - edits[i - 1].timestamp) / 1000;
    if (gapSec > 120) {
      hesitationCount++;
      if (gapSec > 600) signals.add('deep-thinker');
    }
  }

  // Rewrite detection (code length drops > 20%)
  for (let i = 1; i < codeLengths.length; i++) {
    const prevLen = codeLengths[i - 1];
    const curLen = codeLengths[i];
    if (prevLen > 100 && curLen < prevLen * 0.8) {
      rewriteCount++;
    }
  }

  // Count WA/TLE
  testResults.forEach(e => {
    if (e.verdict === 'WA') waCount++;
    if (e.verdict === 'TLE') tleCount++;
  });

  const totalTimeSec = edits.length > 1
    ? (edits[edits.length - 1].timestamp - edits[0].timestamp) / 1000
    : 0;

  // Style classification
  if (tleCount >= 2) signals.add('brute-forcer');
  if (waCount >= 4) signals.add('panic-submitter');
  if (rewriteCount >= 3) signals.add('refactorer');
  if (hesitationCount >= 2 && waCount <= 1) signals.add('methodical-planner');
  if (rewriteCount <= 1 && compilationAttempts <= 2) signals.add('incremental-builder');
  if (totalTimeSec < 600 && waCount <= 1 && compilationAttempts <= 2) signals.add('fast-solver');
  if (hesitationCount === 0 && compilationAttempts >= 5) signals.add('trial-and-error');

  // DNA Axes (0-100 scores)
  const speedScore = Math.max(0, Math.min(100, 100 - Math.floor(totalTimeSec / 60)));
  const accuracyScore = Math.max(0, Math.min(100, 100 - waCount * 15 - tleCount * 10));
  const cleanlinessScore = Math.max(0, Math.min(100, 100 - rewriteCount * 20));
  const resilienceScore = Math.max(0, Math.min(100, 50 + (waCount > 0 && testResults.some(e => e.verdict === 'AC') ? 30 : 0) - hesitationCount * 5));

  return {
    styleSignals: Array.from(signals),
    hesitationCount,
    rewriteCount,
    waCount,
    tleCount,
    compilationAttempts,
    totalTimeSec,
    dnaAxes: { speed: speedScore, accuracy: accuracyScore, cleanliness: cleanlinessScore, resilience: resilienceScore }
  };
}

// ── Gemini Flash Caller ──────────────────────────────────────────────────────
function callGeminiFlash(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json'
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          const tokensUsed = json.usageMetadata?.totalTokenCount || 0;
          if (!text) {
            console.error('[DNA] Gemini returned no text:', JSON.stringify(json).slice(0, 300));
            reject(new Error('Gemini returned empty response'));
            return;
          }
          // Parse the JSON from Gemini's response
          let parsed;
          try { parsed = JSON.parse(text); }
          catch { parsed = { styleSummary: text, strugglePoints: [], pivotAnalysis: '', growthPlan: [] }; }
          resolve({ report: parsed, tokensUsed });
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Prompt Engineering ───────────────────────────────────────────────────────
function buildPrompt(sessionData, heuristics) {
  const {
    problemName, problemConfig, finalCode,
  } = sessionData;

  const { styleSignals, hesitationCount, rewriteCount, waCount, tleCount,
    compilationAttempts, totalTimeSec, dnaAxes } = heuristics;

  const totalMins = Math.round(totalTimeSec / 60);
  const timeLimit = problemConfig?.timeLimit || 'unknown';
  const testCount = problemConfig?.tests?.length || 0;

  return `You are an expert competitive programming coach analyzing a real coding session telemetry.
Analyze the data and respond ONLY with a JSON object in exactly this format:
{
  "styleSummary": "2-3 sentence narrative about the coder's overall thought process style",
  "strugglePoints": [
    { "timestamp": "relative time in session e.g. '5 min'", "issue": "short label", "explanation": "1 sentence" }
  ],
  "pivotAnalysis": "1-2 sentences on the key strategic pivot moment that led to the solution",
  "growthPlan": [
    { "title": "short action title", "detail": "1-2 sentences of concrete advice" },
    { "title": "short action title", "detail": "1-2 sentences of concrete advice" },
    { "title": "short action title", "detail": "1-2 sentences of concrete advice" }
  ],
  "merit": "The single strongest skill demonstrated in this session (1 sentence)",
  "demerit": "The single biggest growth area from this session (1 sentence)"
}

SESSION DATA:
- Problem: ${problemName}
- Time Limit: ${timeLimit}ms, Tests: ${testCount}
- Total Session Duration: ${totalMins} minutes
- Compilation Attempts before AC: ${compilationAttempts}
- Wrong Answers: ${waCount}, Time Limit Exceeded: ${tleCount}
- Detected Hesitation Pauses (thinking gaps >2 min): ${hesitationCount}
- Major Rewrites/Backtracks (deleted >20% of code): ${rewriteCount}
- Detected Style Signals: ${styleSignals.join(', ') || 'none detected'}
- DNA Axes (0-100): Speed=${dnaAxes.speed}, Accuracy=${dnaAxes.accuracy}, Cleanliness=${dnaAxes.cleanliness}, Resilience=${dnaAxes.resilience}

FINAL ACCEPTED CODE (${finalCode?.length || 0} chars):
\`\`\`cpp
${(finalCode || '').substring(0, 2000)}
\`\`\`

Focus on being specific, actionable, and honest. Reference actual patterns from the code if relevant.`;
}

// ── Update Cumulative DNA Profile ────────────────────────────────────────────
function updateDNAProfile(cfHandle, report, dnaAxes) {
  try {
    const existing = db.prepare(`SELECT * FROM dna_profile WHERE cf_handle = ?`).get(cfHandle);

    if (!existing) {
      db.prepare(`
        INSERT INTO dna_profile (cf_handle, total_sessions, avg_speed_score, avg_accuracy_score, avg_cleanliness_score, avg_resilience_score, dominant_style, top_merits, top_demerits, growth_trajectory)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cfHandle,
        dnaAxes.speed, dnaAxes.accuracy, dnaAxes.cleanliness, dnaAxes.resilience,
        report.styleSummary?.slice(0, 50) || '',
        JSON.stringify([report.merit || '']),
        JSON.stringify([report.demerit || '']),
        JSON.stringify([{ date: new Date().toISOString().slice(0, 10), speed: dnaAxes.speed, accuracy: dnaAxes.accuracy }])
      );
    } else {
      const n = existing.total_sessions;
      // Rolling average
      const newSpeed = ((existing.avg_speed_score * n) + dnaAxes.speed) / (n + 1);
      const newAccuracy = ((existing.avg_accuracy_score * n) + dnaAxes.accuracy) / (n + 1);
      const newCleanliness = ((existing.avg_cleanliness_score * n) + dnaAxes.cleanliness) / (n + 1);
      const newResilience = ((existing.avg_resilience_score * n) + dnaAxes.resilience) / (n + 1);

      const merits = JSON.parse(existing.top_merits || '[]');
      const demerits = JSON.parse(existing.top_demerits || '[]');
      if (report.merit) merits.unshift(report.merit);
      if (report.demerit) demerits.unshift(report.demerit);

      const trajectory = JSON.parse(existing.growth_trajectory || '[]');
      trajectory.push({ date: new Date().toISOString().slice(0, 10), speed: Math.round(dnaAxes.speed), accuracy: Math.round(dnaAxes.accuracy) });

      db.prepare(`
        UPDATE dna_profile SET
          total_sessions = total_sessions + 1,
          avg_speed_score = ?, avg_accuracy_score = ?,
          avg_cleanliness_score = ?, avg_resilience_score = ?,
          top_merits = ?, top_demerits = ?,
          growth_trajectory = ?,
          last_updated = datetime('now')
        WHERE cf_handle = ?
      `).run(
        Math.round(newSpeed), Math.round(newAccuracy),
        Math.round(newCleanliness), Math.round(newResilience),
        JSON.stringify(merits.slice(0, 20)),
        JSON.stringify(demerits.slice(0, 20)),
        JSON.stringify(trajectory.slice(-50)),
        cfHandle
      );
    }
  } catch (e) {
    console.error('[DNA] Profile update error:', e.message);
  }
}

// ── Main Entry Point ─────────────────────────────────────────────────────────
async function analyzeDNASession(sessionData, userProvidedKey) {
  const { cfHandle } = sessionData;

  // 1. Quota check
  const quota = checkAndDecrementQuota(cfHandle, userProvidedKey);
  if (!quota.allowed) {
    return {
      error: 'Monthly free limit reached (10 analyses/month). Add your own Gemini API key in Settings for unlimited access.',
      quotaRemaining: 0
    };
  }

  // 2. Heuristic analysis (free, no LLM)
  const events = typeof sessionData.sessionEvents === 'string'
    ? JSON.parse(sessionData.sessionEvents)
    : (sessionData.sessionEvents || []);
  const heuristics = analyzeSessionHeuristics(events);

  // 3. Save session to DB
  const sessionRow = db.prepare(`
    INSERT INTO dna_sessions (
      cf_handle, problem_name, problem_config, session_events, final_code,
      total_time_sec, compilation_attempts, wa_count, tle_count,
      rewrite_count, hesitation_count, style_signals, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'analyzing')
  `).run(
    cfHandle,
    sessionData.problemName || 'Unknown',
    JSON.stringify(sessionData.problemConfig || {}),
    JSON.stringify(events),
    sessionData.finalCode || '',
    Math.round(heuristics.totalTimeSec),
    heuristics.compilationAttempts,
    heuristics.waCount,
    heuristics.tleCount,
    heuristics.rewriteCount,
    heuristics.hesitationCount,
    JSON.stringify(heuristics.styleSignals)
  );
  const sessionId = sessionRow.lastInsertRowid;

  // 4. Select API key
  const keyInfo = selectKey(userProvidedKey);
  if (!keyInfo) {
    db.prepare(`UPDATE dna_sessions SET status = 'key_exhausted' WHERE id = ?`).run(sessionId);
    return { error: 'All API keys exhausted for today. Try again tomorrow or add your own Gemini key.', sessionId };
  }

  // 5. Call Gemini Flash
  let llmResult;
  try {
    const prompt = buildPrompt(sessionData, heuristics);
    llmResult = await callGeminiFlash(keyInfo.keyValue, prompt);
    incrementKeyUsage(keyInfo.poolId, llmResult.tokensUsed);
  } catch (e) {
    console.error('[DNA] Gemini call failed:', e.message);
    db.prepare(`UPDATE dna_sessions SET status = 'llm_error' WHERE id = ?`).run(sessionId);
    return { error: 'LLM call failed: ' + e.message, sessionId, heuristics };
  }

  const report = llmResult.report;

  // 6. Save report
  db.prepare(`
    INSERT INTO dna_reports (
      session_id, cf_handle, problem_name, style_summary, struggle_points,
      pivot_analysis, growth_plan, dna_axes, raw_llm_response, tokens_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    cfHandle,
    sessionData.problemName || 'Unknown',
    report.styleSummary || '',
    JSON.stringify(report.strugglePoints || []),
    report.pivotAnalysis || '',
    JSON.stringify(report.growthPlan || []),
    JSON.stringify(heuristics.dnaAxes),
    JSON.stringify(report),
    llmResult.tokensUsed
  );

  db.prepare(`UPDATE dna_sessions SET status = 'analyzed' WHERE id = ?`).run(sessionId);

  // 7. Update cumulative DNA profile
  updateDNAProfile(cfHandle, report, heuristics.dnaAxes);

  return {
    sessionId,
    report,
    heuristics,
    dnaAxes: heuristics.dnaAxes,
    quotaRemaining: quota.remaining,
    styleSignals: heuristics.styleSignals
  };
}

module.exports = { initDNA, analyzeDNASession, analyzeSessionHeuristics };
