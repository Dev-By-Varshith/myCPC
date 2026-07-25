const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);

/**
 * Global Leaderboard for a specific tag
 */
function getGlobalLeaderboard(tag, limit = 10) {
    const stmt = db.prepare(`
        SELECT cf_handle, elo_rating, last_updated 
        FROM skill_scores 
        WHERE topic_tag = ? 
        ORDER BY elo_rating DESC 
        LIMIT ?
    `);
    return stmt.all(tag, limit);
}

module.exports = { getGlobalLeaderboard };
