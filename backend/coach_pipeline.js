const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'antigravity.db');
const db = new Database(DB_PATH);

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

/**
 * Fetches problem tags from the Codeforces API for context in the coach prompt.
 */
async function fetchProblemTags(problemId) {
    try {
        // Parse contestId and index from problemId like "1920B"
        const match = problemId.match(/^(\d+)([A-Z]\d?)$/i);
        if (!match) return [];
        const [, contestId, index] = match;
        
        const fetch = globalThis.fetch || (await import('node-fetch')).default;
        const res = await fetch(`https://codeforces.com/api/contest.standings?contestId=${contestId}&from=1&count=1`);
        const data = await res.json();
        
        if (data.status === 'OK' && data.result && data.result.problems) {
            const problem = data.result.problems.find(p => p.index === index.toUpperCase());
            if (problem) return problem.tags || [];
        }
    } catch (e) {
        console.error('[Coach] Failed to fetch CF problem tags:', e.message);
    }
    return [];
}

/**
 * Generates a dynamic rule-based coach report from actual features data.
 * Used when no LLM API key is configured.
 */
function generateRuleBasedReport(features) {
    const timeMins = Math.floor(features.time_taken_sec / 60);
    const timeSec = features.time_taken_sec % 60;
    
    // Determine headline based on verdict + metrics
    let headline = '';
    let highlight = '';
    const mistakes = [];
    
    if (features.verdict === 'OK' || features.verdict === 'AC') {
        if (features.edit_churn_score > 5) {
            headline = 'Solved but with excessive rewrites';
            highlight = `You got the right answer in ${timeMins}m ${timeSec}s.`;
            mistakes.push({
                timestamp: `${Math.floor(timeMins / 2)}:00`,
                issue: 'High Edit Churn',
                explanation: `Your edit churn score of ${features.edit_churn_score} suggests heavy trial-and-error. Planning your approach before coding would reduce wasted keystrokes.`
            });
        } else {
            headline = 'Clean solve with good execution';
            highlight = `Solved in ${timeMins}m ${timeSec}s with controlled editing.`;
        }
    } else if (features.verdict === 'TLE' || features.verdict === 'TIME_LIMIT_EXCEEDED') {
        headline = 'Time limit exceeded — wrong complexity';
        highlight = features.idle_gaps_count < 2 ? 'You started coding quickly without much hesitation.' : 'You took time to think before coding.';
        mistakes.push({
            timestamp: `${Math.min(timeMins, 5)}:00`,
            issue: 'Wrong Complexity',
            explanation: `Your solution exceeded the time limit. Review the problem constraints and consider whether a more efficient algorithm (sorting, binary search, two pointers) would fit.`
        });
    } else if (features.verdict === 'WA' || features.verdict === 'WRONG_ANSWER') {
        headline = 'Wrong answer — logic or edge case error';
        highlight = features.edit_churn_score < 3 ? 'Your code was concise, suggesting a clear mental model.' : 'You explored multiple approaches before submitting.';
        mistakes.push({
            timestamp: `${Math.min(timeMins, 3)}:00`,
            issue: 'Incorrect Logic',
            explanation: `Your solution produced wrong output. Check boundary conditions, off-by-one errors, and whether your approach handles all edge cases in the problem statement.`
        });
    } else {
        headline = `${features.verdict} — runtime or compilation issue`;
        highlight = 'Debugging runtime errors builds resilience.';
        mistakes.push({
            timestamp: '01:00',
            issue: features.verdict,
            explanation: `Your code crashed at runtime. Common causes: array out of bounds, integer overflow, or stack overflow from deep recursion.`
        });
    }
    
    // Add burst-submit warning if flagged
    if (features.burst_submit_flag) {
        mistakes.push({
            timestamp: `${timeMins}:00`,
            issue: 'Burst Submitting',
            explanation: 'You submitted multiple times within 2 minutes. Slow down, re-read the problem, and trace through a test case before resubmitting.'
        });
    }
    
    // Add stuck-switch warning if flagged
    if (features.stuck_switch_flag) {
        mistakes.push({
            timestamp: `${Math.floor(timeMins * 0.6)}:00`,
            issue: 'Stuck then Context Switch',
            explanation: 'You were idle for over 5 minutes then switched files. When stuck, try writing out the approach on paper or simplifying to a smaller test case.'
        });
    }
    
    // Socratic question based on verdict
    let socratic = '';
    if (features.verdict === 'TLE' || features.verdict === 'TIME_LIMIT_EXCEEDED') {
        socratic = 'What is the maximum input size, and what is the highest time complexity that can handle it within 2 seconds?';
    } else if (features.verdict === 'WA' || features.verdict === 'WRONG_ANSWER') {
        socratic = 'Can you find the smallest input where your solution gives the wrong output?';
    } else if (features.verdict === 'OK' || features.verdict === 'AC') {
        socratic = 'Could you solve this same problem with a different data structure to improve your understanding?';
    } else {
        socratic = 'Before running your code, did you trace through it manually with the sample test cases?';
    }
    
    return {
        headline,
        highlight,
        diagnosed_mistakes: mistakes,
        topic_trend: { tag: features.problem_id, status: (features.verdict === 'OK' || features.verdict === 'AC') ? 'Improving' : 'Needs review' },
        socratic_question: socratic
    };
}

async function generateCoachReport(sessionId) {
    // 1. Caching Check
    const existing = db.prepare(`SELECT * FROM coach_reports WHERE session_id = ?`).get(sessionId);
    if (existing) return existing;

    // 2. Fetch Facts
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) throw new Error("Session not found");
    
    const features = db.prepare(`SELECT * FROM submissions_features WHERE session_started_at = ?`).get(session.started_at);
    if (!features) throw new Error("Metrics not extracted yet");

    // 3. Fetch real problem tags from CF API
    const tags = await fetchProblemTags(features.problem_id);
    const tagString = tags.length > 0 ? tags.join(', ') : 'unknown';
    
    let llmResponse;

    if (GROQ_API_KEY) {
        // 4a. Real LLM synthesis with actual data
        const prompt = `
You are an elite competitive programming coach.
Analyze this student's session based ONLY on these facts. Do not quote telemetry directly.

Facts:
- Problem: ${features.problem_id}
- Problem Tags: ${tagString}
- Verdict: ${features.verdict}
- Time taken: ${features.time_taken_sec} seconds
- Idle gaps (stuck moments): ${features.idle_gaps_count}
- Edit churn score: ${features.edit_churn_score} (High means trial and error)
- Burst submits: ${features.burst_submit_flag ? 'Yes' : 'No'}
- Stuck then switched problems: ${features.stuck_switch_flag ? 'Yes' : 'No'}

Output a strictly formatted JSON report with:
{
  "headline": "A short, punchy 5-word summary",
  "highlight": "What they did well",
  "diagnosed_mistakes": [ {"timestamp": "MM:SS", "issue": "...", "explanation": "..."} ],
  "topic_trend": {"tag": "${tagString}", "status": "Improving OR Needs review"},
  "socratic_question": "One deeply probing question to make them realize their flaw"
}
`;
        try {
            const fetch = globalThis.fetch || (await import('node-fetch')).default;
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama3-8b-8192',
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' }
                })
            });
            const data = await res.json();
            llmResponse = JSON.parse(data.choices[0].message.content);
        } catch (e) {
            console.error("[Coach] LLM call failed, falling back to rule-based:", e.message);
            llmResponse = generateRuleBasedReport(features);
        }
    } else {
        // 4b. Dynamic rule-based report (no API key needed)
        llmResponse = generateRuleBasedReport(features);
    }

    // 5. Persist Report
    db.prepare(`
        CREATE TABLE IF NOT EXISTS coach_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL UNIQUE,
            headline TEXT,
            highlight TEXT,
            diagnosed_mistakes TEXT,
            topic_trend TEXT,
            socratic_question TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `).run();

    db.prepare(`
        INSERT INTO coach_reports 
        (session_id, headline, highlight, diagnosed_mistakes, topic_trend, socratic_question) 
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        sessionId,
        llmResponse.headline,
        llmResponse.highlight,
        JSON.stringify(llmResponse.diagnosed_mistakes),
        JSON.stringify(llmResponse.topic_trend),
        llmResponse.socratic_question
    );

    return db.prepare(`SELECT * FROM coach_reports WHERE session_id = ?`).get(sessionId);
}

module.exports = { generateCoachReport };
