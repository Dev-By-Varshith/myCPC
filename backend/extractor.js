const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);

// Setup extraction table (Phase 2 feature)
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cf_handle TEXT NOT NULL,
    session_started_at INTEGER,
    problem_id TEXT,
    time_taken_sec INTEGER,
    idle_gaps_count INTEGER,
    max_idle_gap_sec INTEGER,
    edit_churn_score REAL,
    burst_submit_flag BOOLEAN,
    stuck_switch_flag BOOLEAN,
    verdict TEXT,
    extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/**
 * Extracts structured features from a raw JSON trace
 * @param {Object} trace The JSON trace from the VS Code extension
 */
function extractFeatures(trace) {
    if (!trace.events || trace.events.length === 0) return null;

    let idleGapsCount = 0;
    let maxIdleGapMs = 0;
    let totalEditChars = 0;
    let maxEditGapMs = 0; // proxy for stuck time

    let lastEditTime = trace.startedAt;

    trace.events.forEach(event => {
        if (event.type === 'checkpoint' && event.reason === 'idle') {
            idleGapsCount++;
            if (event.duration > maxIdleGapMs) {
                maxIdleGapMs = event.duration;
            }
        }
        if (event.type === 'edit') {
            totalEditChars += event.textLength || 0;
            const gap = event.timestamp - lastEditTime;
            if (gap > maxEditGapMs) maxEditGapMs = gap;
            lastEditTime = event.timestamp;
        }
    });

    const timeTakenSec = Math.floor((trace.endedAt - trace.startedAt) / 1000);
    // Rough churn metric: total characters edited vs typical solution size (~1500 chars)
    const editChurnScore = Math.min(10.0, totalEditChars / 1500.0).toFixed(2);

    // If we have verdicts from the CF poller, attach the first relevant one
    let verdict = 'UNKNOWN';
    let problemId = 'UNKNOWN';
    
    // 1. Burst Submit Detection
    // Are there multiple submissions within 2 minutes of each other?
    let burstSubmitFlag = false;
    if (trace.verdicts && trace.verdicts.length > 1) {
        for (let i = 0; i < trace.verdicts.length - 1; i++) {
            const t1 = trace.verdicts[i].creationTimeSeconds;
            const t2 = trace.verdicts[i+1].creationTimeSeconds;
            if (Math.abs(t1 - t2) < 120) burstSubmitFlag = true; // < 2 mins apart
        }
    }

    if (trace.verdicts && trace.verdicts.length > 0) {
        verdict = trace.verdicts[0].verdict;
        problemId = `${trace.verdicts[0].problem.contestId}${trace.verdicts[0].problem.index}`;
    }

    // 2. Stuck -> Switch (Long idle then edit in a DIFFERENT problem file)
    // Basic heuristic: Max edit gap > 5 mins (300s) followed by context switch.
    let stuckSwitchFlag = false;
    if (maxEditGapMs > 300000) {
        // In a real multi-file trace, we check if file changed after this gap.
        stuckSwitchFlag = true;
    }

    return {
        cf_handle: trace.cfHandle || 'unknown',
        session_started_at: trace.startedAt,
        problem_id: problemId,
        time_taken_sec: timeTakenSec,
        idle_gaps_count: idleGapsCount,
        max_idle_gap_sec: Math.floor(maxIdleGapMs / 1000),
        edit_churn_score: parseFloat(editChurnScore),
        burst_submit_flag: burstSubmitFlag,
        stuck_switch_flag: stuckSwitchFlag,
        verdict
    };
}

/**
 * Simulates the Extraction Job pulling from the Cloudflare R2 bucket
 * (For local dev, we pull from the extension's local queue if needed)
 */
function runExtractionJob(tracePath) {
    try {
        const rawTrace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
        const features = extractFeatures(rawTrace);
        
        if (features) {
            const stmt = db.prepare(`
                INSERT INTO submissions_features 
                (cf_handle, session_started_at, problem_id, time_taken_sec, idle_gaps_count, max_idle_gap_sec, edit_churn_score, burst_submit_flag, stuck_switch_flag, verdict) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                features.cf_handle,
                features.session_started_at,
                features.problem_id,
                features.time_taken_sec,
                features.idle_gaps_count,
                features.max_idle_gap_sec,
                features.edit_churn_score,
                features.burst_submit_flag ? 1 : 0,
                features.stuck_switch_flag ? 1 : 0,
                features.verdict
            );
            
            console.log(`[Extractor] Successfully extracted features for ${features.cf_handle} (Problem: ${features.problem_id})`);
            return true;
        }
    } catch (e) {
        console.error(`[Extractor] Failed to extract ${tracePath}:`, e);
        return false;
    }
}

module.exports = { extractFeatures, runExtractionJob };
