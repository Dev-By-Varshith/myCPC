const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);

try {
    // Insert a mock user
    const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id, username, cf_handle) VALUES (?, ?, ?)`).run(1, 'testuser', 'tourist');
    
    // Insert a mock session
    db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            started_at INTEGER,
            ended_at INTEGER
        )
    `).run();
    db.prepare(`INSERT OR IGNORE INTO sessions (id, user_id, started_at, ended_at) VALUES (?, ?, ?, ?)`).run('mock-session-123', 1, 1715000000000, 1715003600000);
    
    // Insert mock submission features
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
    db.prepare(`INSERT OR IGNORE INTO submissions_features (cf_handle, session_started_at, problem_id, time_taken_sec, idle_gaps_count, max_idle_gap_sec, edit_churn_score, burst_submit_flag, stuck_switch_flag, verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('tourist', 1715000000000, '1920B', 3600, 5, 120, 3.5, 0, 0, 'TLE');
    
    // Insert mock skill scores
    db.exec(`
      CREATE TABLE IF NOT EXISTS skill_scores (
        cf_handle TEXT NOT NULL,
        topic_tag TEXT NOT NULL,
        elo_rating REAL DEFAULT 1200,
        last_updated TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (cf_handle, topic_tag)
      );
    `);
    db.prepare(`INSERT OR IGNORE INTO skill_scores (cf_handle, topic_tag, elo_rating) VALUES (?, ?, ?)`).run('tourist', 'dp', 2400);
    
    // Create coach reports table
    db.exec(`
      CREATE TABLE IF NOT EXISTS coach_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        headline TEXT,
        highlight TEXT,
        diagnosed_mistakes TEXT,
        topic_trend TEXT,
        socratic_question TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    console.log("Mock data seeded successfully.");

    console.log("Mock data seeded successfully.");
} catch (e) {
    console.error("Seed failed:", e);
}
