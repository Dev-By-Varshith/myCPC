import * as https from 'https';
import * as http from 'http';
import * as vscode from 'vscode';
import { Language, MultiLangRunner } from '../runner/MultiLangRunner';

export type SubmitVerdict =
  | 'Submitting'
  | 'In queue'
  | 'Running'
  | 'Accepted'
  | 'Wrong answer'
  | 'Time limit exceeded'
  | 'Memory limit exceeded'
  | 'Runtime error'
  | 'Compilation error'
  | 'Failed'
  | 'Unknown';

export interface SubmitResult {
  success: boolean;
  verdict?: SubmitVerdict;
  submissionId?: number;
  error?: string;
  passedTests?: number;
}

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
export class CFSubmitter {

  private static readonly CF_HOST = 'codeforces.com';
  private static readonly POLL_INTERVAL_MS = 3000;
  private static readonly MAX_POLL_ATTEMPTS = 60; // 3 min max

  // ── Submit ───────────────────────────────────────────────────────────────

  static async submit(
    contestId: number,
    problemIndex: string,
    sourceCode: string,
    lang: Language,
    onStatusUpdate: (status: string) => void
  ): Promise<SubmitResult> {
    const config = vscode.workspace.getConfiguration('mycpc');
    const jsessionid = config.get<string>('cfJsessionid') || '';
    const csrfToken = config.get<string>('cfCsrfToken') || '';
    const cfHandle = config.get<string>('cfHandle') || '';

    if (!jsessionid || !csrfToken || !cfHandle) {
      return {
        success: false,
        error: 'CF credentials not set. Open myCPC Settings and fill in cfHandle, cfJsessionid, and cfCsrfToken.'
      };
    }

    const programTypeId = MultiLangRunner.cfProgramTypeId(lang);

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
    let submissionId: number | undefined;
    try {
      submissionId = await this._post(
        `/contest/${contestId}/submit`,
        body,
        boundary,
        jsessionid,
        csrfToken
      );
    } catch (e: any) {
      return { success: false, error: `Submit POST failed: ${e.message}` };
    }

    onStatusUpdate('Submitted — waiting for verdict...');

    // Poll for verdict
    return await this._pollVerdict(cfHandle, contestId, problemIndex, submissionId, onStatusUpdate);
  }

  // ── Form POST ────────────────────────────────────────────────────────────

  private static _post(
    urlPath: string,
    body: Buffer,
    boundary: string,
    jsessionid: string,
    csrfToken: string
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
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
        } else if (res.statusCode === 403) {
          reject(new Error('403 Forbidden — CSRF token or session cookie is invalid/expired.'));
        } else {
          reject(new Error(`Unexpected HTTP ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ── Verdict Polling ───────────────────────────────────────────────────────

  private static async _pollVerdict(
    cfHandle: string,
    contestId: number,
    problemIndex: string,
    submissionId: number | undefined,
    onStatusUpdate: (s: string) => void
  ): Promise<SubmitResult> {
    for (let attempt = 0; attempt < this.MAX_POLL_ATTEMPTS; attempt++) {
      await this._sleep(this.POLL_INTERVAL_MS);

      try {
        const subs = await this._cfApiGet(`user.status?handle=${cfHandle}&from=1&count=5`);
        const targetIndex = problemIndex.toUpperCase();

        // Find the most recent submission for this contest+problem
        const submission = subs.find((s: any) =>
          s.contestId === contestId &&
          s.problem.index === targetIndex &&
          (submissionId ? s.id >= submissionId : true)
        );

        if (!submission) {
          onStatusUpdate(`Polling... (attempt ${attempt + 1})`);
          continue;
        }

        const verdict = submission.verdict as string;

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

      } catch (e: any) {
        // CF API rate limit or network error — keep polling
        onStatusUpdate(`Polling... (${e.message})`);
      }
    }

    return { success: true, verdict: 'Unknown', error: 'Verdict polling timed out after 3 minutes.' };
  }

  // ── CF API GET (read-only, no auth needed) ────────────────────────────────

  private static _cfApiGet(endpoint: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        `https://codeforces.com/api/${endpoint}`,
        { headers: { 'User-Agent': 'myCPC/3.0' } },
        (res) => {
          let data = '';
          res.on('data', (c) => data += c);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.status === 'OK') resolve(json.result);
              else reject(new Error(json.comment || 'CF API error'));
            } catch (e) { reject(e); }
          });
        }
      );
      req.on('error', reject);
    });
  }

  // ── Multipart Form Builder ────────────────────────────────────────────────

  private static _buildFormData(boundary: string, fields: Record<string, string>): Buffer {
    const parts: Buffer[] = [];
    for (const [name, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      ));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return Buffer.concat(parts);
  }

  // ── Verdict Mapping ───────────────────────────────────────────────────────

  private static _mapVerdict(v: string): SubmitVerdict {
    const map: Record<string, SubmitVerdict> = {
      'OK':                     'Accepted',
      'WRONG_ANSWER':           'Wrong answer',
      'TIME_LIMIT_EXCEEDED':    'Time limit exceeded',
      'MEMORY_LIMIT_EXCEEDED':  'Memory limit exceeded',
      'RUNTIME_ERROR':          'Runtime error',
      'COMPILATION_ERROR':      'Compilation error',
      'FAILED':                 'Failed',
      'PARTIAL':                'Failed',
    };
    return map[v] || 'Unknown';
  }

  private static _sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Helper: Get CF session tokens from browser hint ───────────────────────
  static getSetupInstructions(): string {
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
