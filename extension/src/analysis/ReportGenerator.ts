import { getBackendUrl } from '../env';
import * as https from 'https';
import * as http from 'http';
import { SessionSummary } from './SessionAnalyzer';

export interface DNAReport {
  styleSummary: string;
  strugglePoints: { timestamp: string; issue: string; explanation: string }[];
  pivotAnalysis: string;
  growthPlan: { title: string; detail: string }[];
  merit: string;
  demerit: string;
}

export interface AnalysisResult {
  sessionId: number;
  report: DNAReport;
  dnaAxes: { speed: number; accuracy: number; cleanliness: number; resilience: number };
  styleSignals: string[];
  quotaRemaining: number;
  error?: string;
}

function getBackend(): string {
  return getBackendUrl();
}

function makeRequest(url: URL, method: string, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const client: typeof https = isHttps ? https : (http as any);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    };

    const req = client.request(options, (res: http.IncomingMessage) => {
      let data = '';
      res.on('data', (c: any) => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * ReportGenerator
 * Sends the session summary to the myCPC backend, which handles:
 *   - API key rotation (pool or user's own Gemini key)
 *   - Prompt engineering
 *   - DB storage
 *   - Profile update
 */
export class ReportGenerator {

  static async generateReport(
    cfHandle: string,
    summary: SessionSummary
  ): Promise<AnalysisResult> {
    const userGeminiKey = vscode.workspace.getConfiguration('mycpc').get<string>('geminiApiKey') || '';
    const backend = getBackend();

    const payload = JSON.stringify({
      cfHandle,
      problemName: summary.problemName,
      problemConfig: summary.problemConfig,
      sessionEvents: summary.events,
      finalCode: summary.finalCode,
      userGeminiKey: userGeminiKey || undefined
    });

    const url = new URL(`${backend}/api/dna/analyze`);
    const raw = await makeRequest(url, 'POST', payload);

    const result = JSON.parse(raw);
    if (result.error) throw new Error(result.error);
    return result as AnalysisResult;
  }

  /** Fetch an existing report from the backend by session ID */
  static async fetchReport(sessionId: number): Promise<AnalysisResult | null> {
    try {
      const backend = getBackend();
      const url = new URL(`${backend}/api/dna/report/${sessionId}`);
      const raw = await makeRequest(url, 'GET');
      const json = JSON.parse(raw);
      return json.success ? json : null;
    } catch {
      return null;
    }
  }
}
