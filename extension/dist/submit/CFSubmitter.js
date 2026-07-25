"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CFSubmitter = void 0;
const https = __importStar(require("https"));
const vscode = __importStar(require("vscode"));
const MultiLangRunner_1 = require("../runner/MultiLangRunner");
/**
 * CFSubmitter
 *
 * Auto-submits code to Codeforces by POSTing to the hidden form endpoint.
 *
 * Authentication: JSESSIONID cookie + csrf_token (NOT the CF API — that's read-only).
 *
 * Flow:
 *  1. Build multipart/form-data body
 *  2. POST to https://codeforces.com/contest/{contestId}/submit
 *  3. On success (redirect 302) → poll user.status API for verdict
 *  4. Return final verdict to caller
 */
class CFSubmitter {
    // ── Submit ───────────────────────────────────────────────────────────────
    static async submit(contestId, problemIndex, sourceCode, lang, onStatusUpdate) {
        const config = vscode.workspace.getConfiguration('mycpc');
        const jsessionid = config.get('cfJsessionid') || '';
        const csrfToken = config.get('cfCsrfToken') || '';
        const cfHandle = config.get('cfHandle') || '';
        if (!jsessionid || !csrfToken || !cfHandle) {
            return {
                success: false,
                error: 'CF credentials not set. Open myCPC Settings and fill in cfHandle, cfJsessionid, and cfCsrfToken.'
            };
        }
        const programTypeId = MultiLangRunner_1.MultiLangRunner.cfProgramTypeId(lang);
        onStatusUpdate('Submitting to Codeforces...');
        // Build multipart/form-data
        const boundary = `----FormBoundary${Date.now()}`;
        const body = this._buildFormData(boundary, {
            csrf_token: csrfToken,
            action: 'submitSolutionFormSubmitted',
            contestId: String(contestId),
            submittedProblemIndex: problemIndex.toUpperCase(),
            programTypeId,
            source: sourceCode,
            sourceCodeConfirmed: 'true',
            tabSize: '4',
        });
        // POST
        let submissionId;
        try {
            submissionId = await this._post(`/contest/${contestId}/submit`, body, boundary, jsessionid, csrfToken);
        }
        catch (e) {
            return { success: false, error: `Submit POST failed: ${e.message}` };
        }
        onStatusUpdate('Submitted — waiting for verdict...');
        // Poll for verdict
        return await this._pollVerdict(cfHandle, contestId, problemIndex, submissionId, onStatusUpdate);
    }
    // ── Form POST ────────────────────────────────────────────────────────────
    static _post(urlPath, body, boundary, jsessionid, csrfToken) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.CF_HOST,
                path: urlPath,
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                    'Cookie': `JSESSIONID=${jsessionid}`,
                    'X-Csrf-Token': csrfToken,
                    'User-Agent': 'Mozilla/5.0 (myCPC Extension)',
                    'Referer': `https://codeforces.com${urlPath}`,
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            };
            const req = https.request(options, (res) => {
                // CF redirects to /contest/{id}/my with submission id in URL
                // Or to the submissions page
                const location = res.headers['location'] || '';
                // Read body to completion (avoid socket leak)
                res.resume();
                if (res.statusCode === 302 || res.statusCode === 200) {
                    // Try to extract submission ID from redirect URL
                    const idMatch = location.match(/\/(\d+)(?:\/|$)/) || location.match(/submission\/(\d+)/);
                    const subId = idMatch ? parseInt(idMatch[1]) : 0;
                    resolve(subId);
                }
                else if (res.statusCode === 403) {
                    reject(new Error('403 Forbidden — CSRF token or session cookie is invalid/expired.'));
                }
                else {
                    reject(new Error(`Unexpected HTTP ${res.statusCode}`));
                }
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    // ── Verdict Polling ───────────────────────────────────────────────────────
    static async _pollVerdict(cfHandle, contestId, problemIndex, submissionId, onStatusUpdate) {
        for (let attempt = 0; attempt < this.MAX_POLL_ATTEMPTS; attempt++) {
            await this._sleep(this.POLL_INTERVAL_MS);
            try {
                const subs = await this._cfApiGet(`user.status?handle=${cfHandle}&from=1&count=5`);
                const targetIndex = problemIndex.toUpperCase();
                // Find the most recent submission for this contest+problem
                const submission = subs.find((s) => s.contestId === contestId &&
                    s.problem.index === targetIndex &&
                    (submissionId ? s.id >= submissionId : true));
                if (!submission) {
                    onStatusUpdate(`Polling... (attempt ${attempt + 1})`);
                    continue;
                }
                const verdict = submission.verdict;
                if (verdict === 'TESTING' || !verdict) {
                    const passedTests = submission.passedTestCount || 0;
                    onStatusUpdate(`Running on test ${passedTests + 1}...`);
                    continue;
                }
                // Terminal verdict
                const mapped = this._mapVerdict(verdict);
                onStatusUpdate(mapped);
                return {
                    success: true,
                    verdict: mapped,
                    submissionId: submission.id,
                    passedTests: submission.passedTestCount || 0
                };
            }
            catch (e) {
                // CF API rate limit or network error — keep polling
                onStatusUpdate(`Polling... (${e.message})`);
            }
        }
        return { success: true, verdict: 'Unknown', error: 'Verdict polling timed out after 3 minutes.' };
    }
    // ── CF API GET (read-only, no auth needed) ────────────────────────────────
    static _cfApiGet(endpoint) {
        return new Promise((resolve, reject) => {
            const req = https.get(`https://codeforces.com/api/${endpoint}`, { headers: { 'User-Agent': 'myCPC/3.0' } }, (res) => {
                let data = '';
                res.on('data', (c) => data += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.status === 'OK')
                            resolve(json.result);
                        else
                            reject(new Error(json.comment || 'CF API error'));
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
        });
    }
    // ── Multipart Form Builder ────────────────────────────────────────────────
    static _buildFormData(boundary, fields) {
        const parts = [];
        for (const [name, value] of Object.entries(fields)) {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        }
        parts.push(Buffer.from(`--${boundary}--\r\n`));
        return Buffer.concat(parts);
    }
    // ── Verdict Mapping ───────────────────────────────────────────────────────
    static _mapVerdict(v) {
        const map = {
            'OK': 'Accepted',
            'WRONG_ANSWER': 'Wrong answer',
            'TIME_LIMIT_EXCEEDED': 'Time limit exceeded',
            'MEMORY_LIMIT_EXCEEDED': 'Memory limit exceeded',
            'RUNTIME_ERROR': 'Runtime error',
            'COMPILATION_ERROR': 'Compilation error',
            'FAILED': 'Failed',
            'PARTIAL': 'Failed',
        };
        return map[v] || 'Unknown';
    }
    static _sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
    // ── Helper: Get CF session tokens from browser hint ───────────────────────
    static getSetupInstructions() {
        return `
How to get your CF session credentials:

1. Log in to codeforces.com in your browser
2. Open DevTools (F12) → Application → Storage → Cookies → codeforces.com
3. Copy the value of "JSESSIONID" → paste into mycpc.cfJsessionid setting
4. Open any CF page → DevTools → Network tab → click any request → Headers
5. Find "X-Csrf-Token" in the request headers → paste into mycpc.cfCsrfToken setting

Note: These expire when you log out. Refresh them if submits start failing.
    `.trim();
    }
}
exports.CFSubmitter = CFSubmitter;
CFSubmitter.CF_HOST = 'codeforces.com';
CFSubmitter.POLL_INTERVAL_MS = 3000;
CFSubmitter.MAX_POLL_ATTEMPTS = 60; // 3 min max
//# sourceMappingURL=CFSubmitter.js.map