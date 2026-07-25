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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const express_1 = __importDefault(require("express"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TestViewProvider_1 = require("./ui/TestViewProvider");
const ProblemPanel_1 = require("./ui/ProblemPanel");
const DNALivePanel_1 = require("./ui/DNALivePanel");
const HistoryPanel_1 = require("./ui/HistoryPanel");
const ReportPanel_1 = require("./ui/ReportPanel");
const MultiLangRunner_1 = require("./runner/MultiLangRunner");
const StressTest_1 = require("./runner/StressTest");
const CFSubmitter_1 = require("./submit/CFSubmitter");
const SessionAnalyzer_1 = require("./analysis/SessionAnalyzer");
const ReportGenerator_1 = require("./analysis/ReportGenerator");
// ── Servers ───────────────────────────────────────────────────────────────────
let ccServer = null; // Competitive Companion listener
// ── Status Bar ────────────────────────────────────────────────────────────────
let statusBarItem;
// ── Session State ─────────────────────────────────────────────────────────────
let activeProblem = null;
let activeProblemConfig = null;
let activeSourceFile = null;
let activeSessionFile = null;
let sessionEvents = [];
let codeSnapshots = [];
let sessionStartedAt = 0;
let lastEditTimestamps = []; // rolling window for velocity calc
let snapshotInterval = null;
let timerInterval = null;
let debounceTimer = null;
let stressSignal = { aborted: false };
// ── Panel References ──────────────────────────────────────────────────────────
let testViewProvider;
let problemPanelProvider;
let dnaLivePanelProvider;
let historyPanelProvider;
// ── Helpers ───────────────────────────────────────────────────────────────────
function getWorkspacePath() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}
function mycpcDir() {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, '.mycpc') : null;
}
function ensureMycpcDir() {
    const d = mycpcDir();
    if (d && !fs.existsSync(d))
        fs.mkdirSync(d, { recursive: true });
    return d;
}
function getCppTemplate(problemPayload) {
    const tplPath = vscode.workspace.getConfiguration('mycpc').get('templatePath');
    if (tplPath && fs.existsSync(tplPath))
        return fs.readFileSync(tplPath, 'utf8');
    return `// myCPC — ${problemPayload.name}
// Time: ${problemPayload.timeLimit}ms | Memory: ${problemPayload.memoryLimit}MB
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    
    return 0;
}
`;
}
// ── Session Lifecycle ─────────────────────────────────────────────────────────
function startSession(problemName, config, workspacePath) {
    activeProblem = problemName;
    activeProblemConfig = config;
    sessionStartedAt = Date.now();
    sessionEvents = [{ timestamp: Date.now(), event: 'session_start', problem_name: problemName }];
    codeSnapshots = [];
    lastEditTimestamps = [];
    const dir = ensureMycpcDir();
    activeSessionFile = path.join(dir, `session_${problemName}.json`);
    fs.writeFileSync(activeSessionFile, JSON.stringify([]));
    // Determine active source file
    const lang = vscode.workspace.getConfiguration('mycpc').get('language') || 'cpp';
    const extMap = { cpp: '.cpp', python: '.py', java: '.java', rust: '.rs' };
    activeSourceFile = path.join(workspacePath, `${problemName}${extMap[lang] || '.cpp'}`);
    // Snapshot every 30s
    if (snapshotInterval)
        clearInterval(snapshotInterval);
    snapshotInterval = setInterval(takeCodeSnapshot, 30000);
    // Timer tick every second → updates DNA Live panel
    if (timerInterval)
        clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - sessionStartedAt) / 1000);
        const waCount = sessionEvents.filter(e => e.event === 'test_result' && e.verdict === 'WA').length;
        const tleCount = sessionEvents.filter(e => e.event === 'test_result' && e.verdict === 'TLE').length;
        const compAttempts = sessionEvents.filter(e => e.event === 'test_run').length;
        const heuristics = SessionAnalyzer_1.SessionAnalyzer.analyzePartial(sessionEvents);
        // Edit velocity: chars typed in last 120 seconds
        const now = Date.now();
        lastEditTimestamps = lastEditTimestamps.filter(t => now - t < 120000);
        const velocity = Math.round(lastEditTimestamps.length / 2); // per minute
        dnaLivePanelProvider.update({
            sessionActive: true,
            problemName: activeProblem || '',
            elapsedSec: elapsed,
            editVelocity: velocity,
            hesitationCount: heuristics.hesitationCount,
            rewriteCount: heuristics.rewriteCount,
            waCount,
            tleCount,
            compilationAttempts: compAttempts,
            styleSignals: heuristics.styleSignals,
            tiltWarning: waCount >= 3,
            analysisReady: false,
            quotaRemaining: 10
        });
    }, 1000);
    statusBarItem.text = `$(record-keys) myCPC: ${problemName}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.tooltip = 'myCPC: DNA session active — click for report';
    // Initialize test view with the loaded tests
    testViewProvider.updateState({
        globalStatus: 'Idle',
        lang: MultiLangRunner_1.MultiLangRunner.langLabel(MultiLangRunner_1.MultiLangRunner.detectLanguage(activeSourceFile)),
        timeLimit: config.timeLimit,
        problemName: config.name,
        compilationError: '',
        tests: (config.tests || []).map(t => ({
            input: t.input,
            expectedOutput: t.output,
            actualOutput: '',
            stderr: '',
            status: 'Pending',
            time: 0
        }))
    });
}
function stopSession() {
    if (!activeProblem)
        return;
    flushChanges();
    if (snapshotInterval) {
        clearInterval(snapshotInterval);
        snapshotInterval = null;
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    stressSignal.aborted = true;
    statusBarItem.text = `$(zap) myCPC: Idle`;
    statusBarItem.backgroundColor = undefined;
    activeProblem = null;
    activeProblemConfig = null;
    activeSourceFile = null;
    activeSessionFile = null;
    sessionEvents = [];
    codeSnapshots = [];
    lastEditTimestamps = [];
    dnaLivePanelProvider.reset();
}
function takeCodeSnapshot() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !activeProblem)
        return;
    const code = editor.document.getText();
    codeSnapshots.push({ timestamp: Date.now(), codeLength: code.length, lineCount: editor.document.lineCount, code });
    sessionEvents.push({ timestamp: Date.now(), event: 'snapshot', code_length: code.length });
}
function flushChanges() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    if (!activeSessionFile || sessionEvents.length === 0)
        return;
    try {
        fs.writeFileSync(activeSessionFile, JSON.stringify(sessionEvents, null, 2));
    }
    catch (e) {
        console.error('[myCPC] flush error:', e);
    }
}
// ── DNA Analysis Trigger ──────────────────────────────────────────────────────
async function triggerAnalysis(context) {
    if (!activeProblem || !activeProblemConfig) {
        vscode.window.showWarningMessage('myCPC: No active session to analyze.');
        return;
    }
    const cfHandle = vscode.workspace.getConfiguration('mycpc').get('cfHandle') || 'unknown';
    const editor = vscode.window.activeTextEditor;
    const finalCode = editor ? editor.document.getText() : '';
    sessionEvents.push({ timestamp: Date.now(), event: 'test_result', verdict: 'AC' });
    flushChanges();
    const summary = SessionAnalyzer_1.SessionAnalyzer.buildSummary(activeProblem, activeProblemConfig, sessionEvents, codeSnapshots, finalCode);
    statusBarItem.text = `$(loading~spin) myCPC: Analyzing DNA...`;
    const reportPanel = ReportPanel_1.ReportPanel.createOrShow(context.extensionUri);
    reportPanel.showLoading(activeProblem);
    // Update DNA live panel to "analysis ready" state
    dnaLivePanelProvider.update({ analysisReady: true, sessionActive: true });
    const userGeminiKey = vscode.workspace.getConfiguration('mycpc').get('geminiApiKey') || '';
    try {
        const result = await ReportGenerator_1.ReportGenerator.generateReport(cfHandle, summary);
        if (result.error) {
            reportPanel.showError(result.error);
            statusBarItem.text = `$(error) myCPC: Analysis Failed`;
            vscode.window.showWarningMessage(`myCPC DNA: ${result.error}`);
        }
        else {
            reportPanel.showReport(result, summary);
            statusBarItem.text = `$(check) myCPC: DNA Report Ready`;
            dnaLivePanelProvider.update({ quotaRemaining: result.quotaRemaining ?? 10 });
            // Refresh history
            loadHistory();
            if ((result.quotaRemaining ?? 10) <= 2) {
                vscode.window.showWarningMessage(`⚠️ myCPC: Only ${result.quotaRemaining} free analyses left this month.`, 'Add Gemini Key').then(action => {
                    if (action === 'Add Gemini Key')
                        vscode.commands.executeCommand('workbench.action.openSettings', 'mycpc.geminiApiKey');
                });
            }
        }
    }
    catch (e) {
        reportPanel.showError(`Backend unreachable: ${e.message}`);
        statusBarItem.text = `$(error) myCPC: Backend Offline`;
    }
    stopSession();
}
// ── Test Running ──────────────────────────────────────────────────────────────
async function runAllTests(context) {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showErrorMessage('myCPC: No workspace open.');
        return;
    }
    // Auto-infer problem from open file if not active
    if (!activeProblem) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('myCPC: No active problem or open file.');
            return;
        }
        const basename = path.basename(editor.document.fileName, path.extname(editor.document.fileName));
        const cfg = path.join(ws, '.mycpc', `problem_${basename}.json`);
        if (fs.existsSync(cfg)) {
            const config = JSON.parse(fs.readFileSync(cfg, 'utf8'));
            startSession(basename, config, ws);
        }
        else {
            vscode.window.showWarningMessage('myCPC: No problem config found. Fetch a problem via Competitive Companion first.');
            return;
        }
    }
    const sourceFile = activeSourceFile || path.join(ws, `${activeProblem}.cpp`);
    const outDir = ensureMycpcDir();
    const config = activeProblemConfig;
    const tests = config.tests || [];
    if (tests.length === 0) {
        vscode.window.showWarningMessage('myCPC: No test cases. Add one with ＋ Add Test.');
        return;
    }
    // Log test run
    sessionEvents.push({ timestamp: Date.now(), event: 'test_run' });
    // Update panel to compiling state
    testViewProvider.updateState({
        globalStatus: 'Compiling...',
        tests: tests.map(t => ({ input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending', time: 0 }))
    });
    const lang = MultiLangRunner_1.MultiLangRunner.detectLanguage(sourceFile);
    const timeLimitMs = config.timeLimit || 2000;
    // Compile
    const compileResult = await MultiLangRunner_1.MultiLangRunner.compile(sourceFile, outDir, lang);
    if (!compileResult.success) {
        testViewProvider.updateState({ globalStatus: 'Compilation Error', compilationError: compileResult.error || '' });
        vscode.window.showErrorMessage(`myCPC: Compilation failed — check the Test Cases panel.`);
        return;
    }
    testViewProvider.updateState({ globalStatus: 'Running Tests...' });
    // Run tests
    const { results } = await MultiLangRunner_1.MultiLangRunner.compileAndRunAll(sourceFile, outDir, tests, timeLimitMs, (index, result) => {
        // Log each result
        sessionEvents.push({ timestamp: Date.now(), event: 'test_result', verdict: result.status });
        testViewProvider.updateTestResult(index, {
            status: result.status,
            actualOutput: result.actualOutput,
            stderr: result.stderr,
            time: result.time
        });
    });
    testViewProvider.updateState({ globalStatus: 'Finished' });
    // Check all AC
    const allAC = results.length > 0 && results.every(r => r.status === 'AC');
    const autoAnalyze = vscode.workspace.getConfiguration('mycpc').get('autoAnalyzeOnAC') ?? true;
    if (allAC && autoAnalyze) {
        await triggerAnalysis(context);
    }
}
// ── History Loader ────────────────────────────────────────────────────────────
async function loadHistory() {
    const cfHandle = vscode.workspace.getConfiguration('mycpc').get('cfHandle') || '';
    if (!cfHandle)
        return;
    const backendUrl = vscode.workspace.getConfiguration('mycpc').get('backendUrl') || 'http://localhost:3002';
    historyPanelProvider.setLoading(true);
    try {
        const data = await new Promise((resolve, reject) => {
            const url = new URL(`${backendUrl}/api/dna/history/${cfHandle}?limit=20`);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : require('http');
            const req = client.get(url.toString(), (res) => {
                let body = '';
                res.on('data', (c) => body += c);
                res.on('end', () => { try {
                    resolve(JSON.parse(body));
                }
                catch (e) {
                    reject(e);
                } });
            });
            req.on('error', reject);
        });
        if (data.success) {
            const entries = data.history.map((h) => ({
                sessionId: h.session_id,
                problemName: h.problem_name,
                date: h.generated_at,
                totalTimeSec: h.total_time_sec,
                waCount: h.wa_count,
                status: 'solved',
                dnaAxes: h.dna_axes,
                styleSignals: h.style_signals
            }));
            historyPanelProvider.setHistory(entries, cfHandle);
        }
    }
    catch (e) {
        historyPanelProvider.setLoading(false);
    }
}
// ── Activate ──────────────────────────────────────────────────────────────────
function activate(context) {
    console.log('[myCPC] v3 activated — Full CP Environment + DNA Coach');
    // ── Register 4 Sidebar Panels ─────────────────────────────────────────────
    testViewProvider = new TestViewProvider_1.TestViewProvider();
    problemPanelProvider = new ProblemPanel_1.ProblemPanel();
    dnaLivePanelProvider = new DNALivePanel_1.DNALivePanel();
    historyPanelProvider = new HistoryPanel_1.HistoryPanel();
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(TestViewProvider_1.TestViewProvider.viewType, testViewProvider), vscode.window.registerWebviewViewProvider(ProblemPanel_1.ProblemPanel.viewType, problemPanelProvider), vscode.window.registerWebviewViewProvider(DNALivePanel_1.DNALivePanel.viewType, dnaLivePanelProvider), vscode.window.registerWebviewViewProvider(HistoryPanel_1.HistoryPanel.viewType, historyPanelProvider));
    // Wire panel callbacks
    testViewProvider.onRunAll = () => runAllTests(context);
    testViewProvider.onRunSingle = (i) => runSingleTest(i, context);
    testViewProvider.onAddTest = () => addTestCase();
    testViewProvider.onDeleteTest = (i) => deleteTestCase(i);
    testViewProvider.onEditTest = (i) => editTestCase(i);
    testViewProvider.onStressTest = () => runStressTest();
    problemPanelProvider.onSubmit = () => submitToCF();
    dnaLivePanelProvider.onOpenReport = () => ReportPanel_1.ReportPanel.createOrShow(context.extensionUri);
    dnaLivePanelProvider.onAnalyzeNow = () => triggerAnalysis(context);
    historyPanelProvider.onOpenSession = (sessionId) => openHistoryReport(sessionId, context);
    historyPanelProvider.onRefresh = () => loadHistory();
    // ── Status Bar ────────────────────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = `$(zap) myCPC`;
    statusBarItem.command = 'mycpc.openReport';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // ── Deep Edit Tracker ─────────────────────────────────────────────────────
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (!activeProblem || event.document.uri.scheme !== 'file')
            return;
        const codeLength = event.document.getText().length;
        const changes = event.contentChanges.map(c => ({
            range: `${c.range.start.line}:${c.range.start.character}`,
            textLength: c.text.length,
            deleted: c.rangeLength
        }));
        const now = Date.now();
        // Track individual character additions for velocity
        const charsAdded = event.contentChanges.reduce((sum, c) => sum + c.text.length, 0);
        for (let i = 0; i < Math.min(charsAdded, 20); i++)
            lastEditTimestamps.push(now);
        sessionEvents.push({ timestamp: now, event: 'edit', code_length: codeLength, diff_summary: changes });
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flushChanges, 5000);
    }));
    // ── Commands ──────────────────────────────────────────────────────────────
    const cmds = [
        ['mycpc.runTests', () => runAllTests(context)],
        ['mycpc.stopSession', () => { stopSession(); vscode.window.showInformationMessage('myCPC: Session stopped.'); }],
        ['mycpc.analyzeSession', () => triggerAnalysis(context)],
        ['mycpc.openReport', () => ReportPanel_1.ReportPanel.createOrShow(context.extensionUri)],
        ['mycpc.addTestCase', () => addTestCase()],
        ['mycpc.deleteTestCase', () => vscode.window.showInputBox({ prompt: 'Test number to delete (1-based)' }).then(v => { if (v)
                deleteTestCase(parseInt(v) - 1); })],
        ['mycpc.stressTest', () => runStressTest()],
        ['mycpc.submitCF', () => submitToCF()],
        ['mycpc.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'mycpc')],
        ['mycpc.openDashboard', () => {
                const url = (vscode.workspace.getConfiguration('mycpc').get('backendUrl') || 'http://localhost:3002').replace(':3002', ':5173') + '/dna';
                vscode.env.openExternal(vscode.Uri.parse(url));
            }],
        ['mycpc.setLanguage', async () => {
                const lang = await vscode.window.showQuickPick(['C++17', 'Python3', 'Java', 'Rust'], { placeHolder: 'Select language' });
                if (lang) {
                    const map = { 'C++17': 'cpp', 'Python3': 'python', 'Java': 'java', 'Rust': 'rust' };
                    await vscode.workspace.getConfiguration('mycpc').update('language', map[lang], vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage(`myCPC: Language set to ${lang}`);
                }
            }],
        // ── Panel focus commands (bring a specific panel into view) ────────────
        ['mycpc.openProblem', () => vscode.commands.executeCommand('mycpc.problemView.focus')],
        ['mycpc.openHistory', () => vscode.commands.executeCommand('mycpc.historyView.focus')],
        ['mycpc.openDNA', () => vscode.commands.executeCommand('mycpc.dnaView.focus')],
        // ── Stress test file helpers ───────────────────────────────────────────
        ['mycpc.openBruteFile', async () => {
                const file = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, openLabel: 'Set Brute Force File', filters: { 'Source Files': ['cpp', 'py', 'java', 'rs'] } });
                if (file?.[0]) {
                    await vscode.workspace.getConfiguration('mycpc').update('_bruteFile', file[0].fsPath, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage(`myCPC: Brute force file set → ${path.basename(file[0].fsPath)}`);
                }
            }],
        ['mycpc.generateTests', () => runStressTest()],
        // ── Import test cases from a CF problem URL ────────────────────────────
        ['mycpc.importFromUrl', () => importTestsFromUrl()],
        // ── Problem statement viewer ───────────────────────────────────────────
        ['mycpc.viewProblemStatement', () => viewProblemStatement(context)],
    ];
    cmds.forEach(([id, fn]) => context.subscriptions.push(vscode.commands.registerCommand(id, fn)));
    // ── Load initial history ──────────────────────────────────────────────────
    loadHistory();
    // ── Start Competitive Companion Listener ──────────────────────────────────
    startCCServer(context);
}
exports.activate = activate;
// ── Test Case Management ──────────────────────────────────────────────────────
async function addTestCase() {
    if (!activeProblemConfig) {
        vscode.window.showWarningMessage('myCPC: No active problem. Fetch one via Competitive Companion first.');
        return;
    }
    const input = await vscode.window.showInputBox({ prompt: 'Enter test case input (use \\n for newlines)', placeHolder: '1 2 3' });
    if (input === undefined)
        return;
    const output = await vscode.window.showInputBox({ prompt: 'Enter expected output', placeHolder: '6' });
    if (output === undefined)
        return;
    const realInput = input.replace(/\\n/g, '\n');
    const realOutput = output.replace(/\\n/g, '\n');
    activeProblemConfig.tests.push({ input: realInput, output: realOutput });
    saveConfig();
    testViewProvider.updateState({
        tests: activeProblemConfig.tests.map(t => ({
            input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending', time: 0
        }))
    });
    vscode.window.showInformationMessage(`myCPC: Added test case #${activeProblemConfig.tests.length}`);
}
function deleteTestCase(index) {
    if (!activeProblemConfig || index < 0 || index >= activeProblemConfig.tests.length)
        return;
    activeProblemConfig.tests.splice(index, 1);
    saveConfig();
    testViewProvider.updateState({
        tests: activeProblemConfig.tests.map(t => ({
            input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending', time: 0
        }))
    });
}
function saveConfig() {
    if (!activeProblem || !activeProblemConfig)
        return;
    const dir = mycpcDir();
    if (!dir)
        return;
    const cfgPath = path.join(dir, `problem_${activeProblem}.json`);
    fs.writeFileSync(cfgPath, JSON.stringify(activeProblemConfig, null, 2));
}
// ── Edit Test Case ────────────────────────────────────────────────────────────
async function editTestCase(index) {
    if (!activeProblemConfig || index < 0 || index >= activeProblemConfig.tests.length)
        return;
    const existing = activeProblemConfig.tests[index];
    const newInput = await vscode.window.showInputBox({
        prompt: `Edit input for Test ${index + 1}`,
        value: existing.input.replace(/\n/g, '\\n'),
        placeHolder: 'Use \\n for newlines'
    });
    if (newInput === undefined)
        return;
    const newOutput = await vscode.window.showInputBox({
        prompt: `Edit expected output for Test ${index + 1}`,
        value: existing.output.replace(/\n/g, '\\n'),
        placeHolder: 'Expected output'
    });
    if (newOutput === undefined)
        return;
    activeProblemConfig.tests[index] = {
        input: newInput.replace(/\\n/g, '\n'),
        output: newOutput.replace(/\\n/g, '\n')
    };
    saveConfig();
    testViewProvider.updateState({
        tests: activeProblemConfig.tests.map(t => ({
            input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending', time: 0
        }))
    });
    vscode.window.showInformationMessage(`myCPC: Test ${index + 1} updated.`);
}
// ── Import Test Cases from URL ─────────────────────────────────────────────────
async function importTestsFromUrl() {
    if (!activeProblemConfig) {
        vscode.window.showWarningMessage('myCPC: Load a problem first via Competitive Companion.');
        return;
    }
    // Use URL from the loaded problem config, or ask
    let url = activeProblemConfig.url || '';
    if (!url) {
        const input = await vscode.window.showInputBox({ prompt: 'Enter Codeforces problem URL', placeHolder: 'https://codeforces.com/contest/1234/problem/A' });
        if (!input)
            return;
        url = input;
    }
    statusBarItem.text = `$(loading~spin) myCPC: Fetching tests from URL...`;
    try {
        const html = await fetchUrl(url);
        const tests = scrapeTests(html);
        if (tests.length === 0) {
            vscode.window.showWarningMessage(`myCPC: No sample tests found at ${url}. The page may require login or the format differs.`);
            statusBarItem.text = `$(zap) myCPC`;
            return;
        }
        // Merge (don't duplicate exact matches)
        let added = 0;
        for (const t of tests) {
            const isDupe = activeProblemConfig.tests.some(e => e.input.trim() === t.input.trim());
            if (!isDupe) {
                activeProblemConfig.tests.push(t);
                added++;
            }
        }
        saveConfig();
        testViewProvider.updateState({
            tests: activeProblemConfig.tests.map(t => ({
                input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending', time: 0
            }))
        });
        statusBarItem.text = `$(check) myCPC: Imported ${added} tests`;
        vscode.window.showInformationMessage(`myCPC: Imported ${added} new sample test(s) from URL.`);
    }
    catch (e) {
        statusBarItem.text = `$(error) myCPC: Import failed`;
        vscode.window.showErrorMessage(`myCPC: Failed to fetch tests — ${e.message}`);
    }
}
/** Fetch plain HTML from a URL (no JS execution — CF sample tests are SSR) */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https');
        const client = isHttps ? https : http;
        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (myCPC/3.0)',
                'Accept': 'text/html'
            }
        }, (res) => {
            // Follow single redirect
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                res.resume();
                return;
            }
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });
}
/** Scrape sample tests from Codeforces / CSES HTML using regex */
function scrapeTests(html) {
    const tests = [];
    // Codeforces: <div class="input"><div class="title">Input</div><pre>...</pre></div>
    const cfInputRe = /<div class="input">[\s\S]*?<pre>([\s\S]*?)<\/pre>/gi;
    const cfOutputRe = /<div class="output">[\s\S]*?<pre>([\s\S]*?)<\/pre>/gi;
    const inputs = [];
    const outputs = [];
    let m;
    while ((m = cfInputRe.exec(html)) !== null)
        inputs.push(cleanHtml(m[1]));
    while ((m = cfOutputRe.exec(html)) !== null)
        outputs.push(cleanHtml(m[1]));
    // Pair them up
    const count = Math.min(inputs.length, outputs.length);
    for (let i = 0; i < count; i++) {
        tests.push({ input: inputs[i], output: outputs[i] });
    }
    return tests;
}
function cleanHtml(s) {
    return s
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .trim() + '\n';
}
// ── Problem Statement Viewer ───────────────────────────────────────────────────
function viewProblemStatement(context) {
    if (!activeProblemConfig?.url) {
        vscode.window.showWarningMessage('myCPC: No problem loaded. Fetch one via Competitive Companion first.');
        return;
    }
    const url = activeProblemConfig.url;
    const problemName = activeProblemConfig.name || 'Problem';
    const panel = vscode.window.createWebviewPanel('mycpcProblem', `📋 ${problemName}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1e1e; color: #ccc; font-family: sans-serif; }
  .toolbar {
    padding: 8px 12px;
    background: #2d2d2d;
    border-bottom: 1px solid #444;
    display: flex; align-items: center; gap: 10px;
    font-size: 12px;
  }
  .url-label { color: #5ecfff; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open-btn {
    background: rgba(94,207,255,0.1); color: #5ecfff;
    border: 1px solid rgba(94,207,255,0.3); border-radius: 4px;
    padding: 3px 10px; cursor: pointer; font-size: 11px;
    text-decoration: none; white-space: nowrap;
  }
  .note {
    padding: 10px 14px;
    background: rgba(251,191,36,0.08);
    border-bottom: 1px solid rgba(251,191,36,0.2);
    font-size: 11px; color: #fbbf24; line-height: 1.6;
  }
  iframe {
    width: 100%; border: none;
    height: calc(100vh - 82px);
  }
</style>
</head>
<body>
<div class="toolbar">
  <span class="url-label">${url}</span>
  <a class="open-btn" href="${url}" target="_blank">Open in Browser ↗</a>
</div>
<div class="note">
  ⚠️ CF requires login for interactive problems. If the page is blank, click <strong>"Open in Browser ↗"</strong> above.
</div>
<iframe src="${url}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
</body>
</html>`;
}
// ── Single Test Run ───────────────────────────────────────────────────────────
async function runSingleTest(index, context) {
    const ws = getWorkspacePath();
    if (!ws || !activeProblem || !activeProblemConfig)
        return;
    const sourceFile = activeSourceFile || path.join(ws, `${activeProblem}.cpp`);
    const outDir = ensureMycpcDir();
    const lang = MultiLangRunner_1.MultiLangRunner.detectLanguage(sourceFile);
    const test = activeProblemConfig.tests[index];
    if (!test)
        return;
    testViewProvider.updateTestResult(index, { status: 'Running', actualOutput: '', stderr: '' });
    const compileResult = await MultiLangRunner_1.MultiLangRunner.compile(sourceFile, outDir, lang);
    if (!compileResult.success) {
        testViewProvider.updateState({ globalStatus: 'Compilation Error', compilationError: compileResult.error || '' });
        return;
    }
    const result = await MultiLangRunner_1.MultiLangRunner.run(sourceFile, outDir, lang, test.input, activeProblemConfig.timeLimit || 2000);
    const expected = MultiLangRunner_1.MultiLangRunner._normalize(test.output);
    const actual = MultiLangRunner_1.MultiLangRunner._normalize(result.stdout);
    const status = result.tle ? 'TLE' : result.code !== 0 ? 'RE' : expected === actual ? 'AC' : 'WA';
    testViewProvider.updateTestResult(index, { status, actualOutput: result.stdout, stderr: result.stderr, time: result.time });
}
// ── Stress Test ───────────────────────────────────────────────────────────────
async function runStressTest() {
    const ws = getWorkspacePath();
    if (!ws || !activeProblem) {
        vscode.window.showWarningMessage('myCPC: No active problem.');
        return;
    }
    const solutionFile = activeSourceFile || path.join(ws, `${activeProblem}.cpp`);
    const bruteFile = await vscode.window.showOpenDialog({
        canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
        openLabel: 'Select Brute Force File',
        filters: { 'Source Files': ['cpp', 'py', 'java', 'rs'] }
    });
    if (!bruteFile)
        return;
    const genFile = await vscode.window.showOpenDialog({
        canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
        openLabel: 'Select Generator File',
        filters: { 'Source Files': ['cpp', 'py', 'java', 'rs'] }
    });
    if (!genFile)
        return;
    const iterations = vscode.workspace.getConfiguration('mycpc').get('stressTestCount') || 100;
    const timeLimitMs = activeProblemConfig?.timeLimit || 2000;
    stressSignal = { aborted: false };
    testViewProvider.updateState({ globalStatus: 'Stress Test' });
    statusBarItem.text = `$(loading~spin) myCPC: Stress Testing...`;
    const stressResult = await StressTest_1.StressTest.run(ws, solutionFile, bruteFile[0].fsPath, genFile[0].fsPath, iterations, timeLimitMs, (progress) => {
        statusBarItem.text = `$(loading~spin) myCPC: Stress ${progress.current}/${progress.total}`;
    }, stressSignal);
    testViewProvider.updateState({
        globalStatus: 'Finished',
        stressResult: {
            passed: stressResult.passed,
            failed: stressResult.failed,
            failingInput: stressResult.failingInput,
            bruteOutput: stressResult.bruteOutput,
            optOutput: stressResult.optOutput
        }
    });
    if (stressResult.failed === 0) {
        statusBarItem.text = `$(check) myCPC: Stress ✓ (${stressResult.passed} passed)`;
        vscode.window.showInformationMessage(`myCPC: Stress test passed! ${stressResult.passed}/${iterations} tests OK.`);
    }
    else {
        statusBarItem.text = `$(error) myCPC: Stress FAIL`;
        vscode.window.showWarningMessage(`myCPC: Stress test found a mismatch on test ${stressResult.testIndex}! Check Test Cases panel.`);
    }
}
// ── CF Submit ─────────────────────────────────────────────────────────────────
async function submitToCF() {
    const cfHandle = vscode.workspace.getConfiguration('mycpc').get('cfHandle');
    const jsessionid = vscode.workspace.getConfiguration('mycpc').get('cfJsessionid');
    const csrf = vscode.workspace.getConfiguration('mycpc').get('cfCsrfToken');
    if (!cfHandle || !jsessionid || !csrf) {
        const action = await vscode.window.showErrorMessage('myCPC: CF credentials not configured. Set cfHandle, cfJsessionid, and cfCsrfToken in settings.', 'Open Settings');
        if (action === 'Open Settings')
            vscode.commands.executeCommand('workbench.action.openSettings', 'mycpc');
        return;
    }
    if (!activeProblemConfig?.contestId || !activeProblemConfig?.problemIndex) {
        vscode.window.showWarningMessage('myCPC: This problem has no contest/problem index. CF submit only works for Codeforces problems.');
        return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('myCPC: No active editor.');
        return;
    }
    const sourceCode = editor.document.getText();
    const lang = MultiLangRunner_1.MultiLangRunner.detectLanguage(editor.document.fileName);
    statusBarItem.text = `$(loading~spin) myCPC: Submitting...`;
    problemPanelProvider.setSubmitStatus('Submitting...');
    const result = await CFSubmitter_1.CFSubmitter.submit(activeProblemConfig.contestId, activeProblemConfig.problemIndex, sourceCode, lang, (status) => {
        statusBarItem.text = `$(loading~spin) myCPC: ${status}`;
        problemPanelProvider.setSubmitStatus(status);
    });
    if (!result.success) {
        statusBarItem.text = `$(error) myCPC: Submit Failed`;
        problemPanelProvider.setSubmitStatus(result.error || 'Submit failed', 'Failed');
        vscode.window.showErrorMessage(`myCPC Submit: ${result.error}`);
        return;
    }
    const verdictText = result.verdict || 'Unknown';
    const isAC = verdictText === 'Accepted';
    statusBarItem.text = isAC ? `$(check) myCPC: Accepted ✓` : `$(warning) myCPC: ${verdictText}`;
    problemPanelProvider.setSubmitStatus(isAC ? `Passed ${result.passedTests} tests` : `Failed on test ${(result.passedTests || 0) + 1}`, verdictText);
    vscode.window.showInformationMessage(`myCPC CF Submit: ${verdictText}` + (result.submissionId ? ` (#${result.submissionId})` : ''));
}
// ── History Report Opener ─────────────────────────────────────────────────────
async function openHistoryReport(sessionId, context) {
    const reportPanel = ReportPanel_1.ReportPanel.createOrShow(context.extensionUri);
    reportPanel.showLoading('Loading...');
    const result = await ReportGenerator_1.ReportGenerator.fetchReport(sessionId);
    if (result) {
        // Build a minimal summary for display purposes
        const dummySummary = {
            problemName: result.report?.problem_name || 'Unknown',
            problemConfig: {},
            events: [],
            snapshots: [],
            finalCode: '',
            startedAt: Date.now(),
            endedAt: Date.now(),
            totalTimeSec: 0,
            hesitationPauses: [],
            rewriteCount: 0,
            compilationAttempts: 0,
            waCount: 0,
            tleCount: 0
        };
        reportPanel.showReport(result, dummySummary);
    }
    else {
        reportPanel.showError('Could not load this report from the backend.');
    }
}
// ── Competitive Companion Server ──────────────────────────────────────────────
function startCCServer(context) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json({ limit: '10mb' }));
    app.post('/', (req, res) => {
        const payload = req.body;
        const ws = getWorkspacePath();
        if (!ws) {
            vscode.window.showErrorMessage('myCPC: Open a folder before fetching problems.');
            return res.status(400).json({ error: 'No workspace' });
        }
        const rawName = payload.name || 'Unknown_Problem';
        const problemName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/__+/g, '_').slice(0, 60);
        try {
            const dir = ensureMycpcDir();
            // Save config
            const cfgPath = path.join(dir, `problem_${problemName}.json`);
            fs.writeFileSync(cfgPath, JSON.stringify(payload, null, 2));
            // Create source file
            const lang = vscode.workspace.getConfiguration('mycpc').get('language') || 'cpp';
            const extMap = { cpp: '.cpp', python: '.py', java: '.java', rust: '.rs' };
            const srcFile = path.join(ws, `${problemName}${extMap[lang] || '.cpp'}`);
            if (!fs.existsSync(srcFile)) {
                fs.writeFileSync(srcFile, getCppTemplate(payload));
            }
            // Cast payload to ProblemMeta (CC payload structure is compatible)
            const meta = {
                name: payload.name,
                group: payload.group || '',
                url: payload.url || '',
                contestId: payload.contestId,
                problemIndex: payload.problemIndex || payload.name?.match(/^([A-Z]+)\.\s/)?.[1],
                timeLimit: payload.timeLimit || 2000,
                memoryLimit: payload.memoryLimit || 256,
                tests: payload.tests || [],
                interactive: payload.interactive || false
            };
            // Start session
            startSession(problemName, meta, ws);
            // Show Problem panel
            problemPanelProvider.setProblem(meta);
            // Open file
            vscode.workspace.openTextDocument(srcFile).then(doc => vscode.window.showTextDocument(doc));
            vscode.window.showInformationMessage(`🧬 myCPC: "${payload.name}" loaded — ${(payload.tests || []).length} sample tests. DNA tracking started!`, 'Run Tests').then(action => { if (action === 'Run Tests')
                vscode.commands.executeCommand('mycpc.runTests'); });
            res.sendStatus(200);
        }
        catch (e) {
            vscode.window.showErrorMessage(`myCPC: Error loading problem — ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });
    ccServer = http.createServer(app);
    ccServer.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            vscode.window.showWarningMessage('myCPC: Port 10043 in use. Is another CPH instance running?');
        }
    });
    ccServer.listen(10043, '127.0.0.1', () => {
        console.log('[myCPC] Competitive Companion listener ready on port 10043');
    });
}
// ── Deactivate ────────────────────────────────────────────────────────────────
function deactivate() {
    flushChanges();
    if (snapshotInterval)
        clearInterval(snapshotInterval);
    if (timerInterval)
        clearInterval(timerInterval);
    if (ccServer)
        ccServer.close();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map