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
exports.ReportGenerator = void 0;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
function getBackend() {
    return vscode.workspace.getConfiguration('mycpc').get('backendUrl') || 'http://localhost:3002';
}
function makeRequest(url, method, body) {
    return new Promise((resolve, reject) => {
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: body ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            } : {}
        };
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        if (body)
            req.write(body);
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
class ReportGenerator {
    static async generateReport(cfHandle, summary) {
        const userGeminiKey = vscode.workspace.getConfiguration('mycpc').get('geminiApiKey') || '';
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
        if (result.error)
            throw new Error(result.error);
        return result;
    }
    /** Fetch an existing report from the backend by session ID */
    static async fetchReport(sessionId) {
        try {
            const backend = getBackend();
            const url = new URL(`${backend}/api/dna/report/${sessionId}`);
            const raw = await makeRequest(url, 'GET');
            const json = JSON.parse(raw);
            return json.success ? json : null;
        }
        catch {
            return null;
        }
    }
}
exports.ReportGenerator = ReportGenerator;
//# sourceMappingURL=ReportGenerator.js.map