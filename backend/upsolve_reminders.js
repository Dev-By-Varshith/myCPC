const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);

/**
 * Phase 7: Upsolve Reminders
 * Cron job stub to email users (via Resend) about problems they failed days ago.
 */
function sendUpsolveReminders() {
    console.log('[Upsolve Reminder] Scanning for spaced-repetition candidates...');
    
    // Find all users who had a TLE/WA/RE more than 3 days ago but haven't AC'd it since
    const candidates = db.prepare(`
        SELECT DISTINCT cf_handle, problem_id 
        FROM submissions_features 
        WHERE verdict != 'OK' AND verdict != 'AC'
        AND (julianday('now') - julianday(datetime(session_started_at/1000, 'unixepoch'))) > 3
    `).all();

    if (candidates.length === 0) {
        console.log('[Upsolve Reminder] No reminders to send today.');
        return;
    }

    candidates.forEach(c => {
        // In a real app, look up user email and send via Resend:
        // await resend.emails.send({ to: user.email, subject: "Time to upsolve!", text: ... })
        console.log(`[Upsolve Reminder] Queued email to ${c.cf_handle} to upsolve problem ${c.problem_id}`);
    });
}

module.exports = { sendUpsolveReminders };
