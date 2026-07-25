const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS skill_scores (
    cf_handle TEXT NOT NULL,
    topic_tag TEXT NOT NULL,
    elo_rating REAL DEFAULT 1200,
    last_updated TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (cf_handle, topic_tag)
  );
`);

/**
 * Calculates new Elo rating.
 * @param {number} userElo Current user rating for this topic
 * @param {number} problemRating Difficulty of the problem
 * @param {boolean} isWin 1 if solved (AC), 0 if failed (WA/TLE/RE)
 */
function calculateElo(userElo, problemRating, isWin) {
    const K = 32; // Scaling factor
    const expectedScore = 1 / (1 + Math.pow(10, (problemRating - userElo) / 400));
    const actualScore = isWin ? 1 : 0;
    return userElo + K * (actualScore - expectedScore);
}

/**
 * Update Elo based on a new submission verdict
 */
function updateTopicElo(cfHandle, tags, problemRating, verdict) {
    if (!tags || tags.length === 0) return;
    const isWin = (verdict === 'OK' || verdict === 'AC');

    tags.forEach(tag => {
        let row = db.prepare(`SELECT elo_rating FROM skill_scores WHERE cf_handle = ? AND topic_tag = ?`).get(cfHandle, tag);
        
        let newElo;
        if (row) {
            newElo = calculateElo(row.elo_rating, problemRating, isWin);
            db.prepare(`UPDATE skill_scores SET elo_rating = ?, last_updated = datetime('now') WHERE cf_handle = ? AND topic_tag = ?`)
              .run(newElo, cfHandle, tag);
        } else {
            // Baseline starting Elo defaults to problemRating if they win their first, or 1200
            const startingElo = 1200; 
            newElo = calculateElo(startingElo, problemRating, isWin);
            db.prepare(`INSERT INTO skill_scores (cf_handle, topic_tag, elo_rating) VALUES (?, ?, ?)`)
              .run(cfHandle, tag, newElo);
        }
    });
}

/**
 * Nightly Cron Job: Applies Mastery Decay
 * If a topic is untouched for > 3 weeks, it loses 1% of its rating per week.
 */
function applyMasteryDecay() {
    console.log('[Elo Engine] Running nightly mastery decay...');
    const result = db.prepare(`
        UPDATE skill_scores
        SET elo_rating = elo_rating * 0.99
        WHERE (julianday('now') - julianday(last_updated)) > 21
    `).run();
    console.log(`[Elo Engine] Decay applied to ${result.changes} inactive topics.`);
}

module.exports = { updateTopicElo, applyMasteryDecay };
