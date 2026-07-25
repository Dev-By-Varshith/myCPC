import * as vscode from 'vscode';
import express from 'express';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

import { TestViewProvider }             from './ui/TestViewProvider';
import { ProblemPanel, ProblemMeta }    from './ui/ProblemPanel';
import { DNALivePanel }                 from './ui/DNALivePanel';
import { HistoryPanel, HistoryEntry }   from './ui/HistoryPanel';
import { ReportPanel }                  from './ui/ReportPanel';
import { BugPatternTracker }            from './analysis/BugPatternTracker';

import { MultiLangRunner, TestCaseResult } from './runner/MultiLangRunner';
import { StressTest }                   from './runner/StressTest';
import { CFSubmitter }                  from './submit/CFSubmitter';
import { SessionAnalyzer, SessionEvent, CodeSnapshot } from './analysis/SessionAnalyzer';
import { ReportGenerator }              from './analysis/ReportGenerator';
import { getBackendUrl, getListenerPort } from './env';

// ── Servers ───────────────────────────────────────────────────────────────────
let ccServer: http.Server | null = null;        // Competitive Companion listener

// ── Status Bar ────────────────────────────────────────────────────────────────
let statusBarItem: vscode.StatusBarItem;

// ── Session State ─────────────────────────────────────────────────────────────
let activeProblem: string | null      = null;
let activeProblemConfig: ProblemMeta | null = null;
let activeSourceFile: string | null   = null;
let activeSessionFile: string | null  = null;

let sessionEvents: SessionEvent[]  = [];
let codeSnapshots: CodeSnapshot[]  = [];
let sessionStartedAt               = 0;
let lastEditTimestamps: number[]   = [];   // rolling window for velocity calc
let snapshotInterval: NodeJS.Timeout | null = null;
let timerInterval: NodeJS.Timeout | null    = null;
let debounceTimer: NodeJS.Timeout | null    = null;
let stressSignal                   = { aborted: false };

// ── Progressive Hint State ────────────────────────────────────────────────────
let hintCheckInterval: NodeJS.Timeout | null = null;
let hintsOffered       = 0;    // how many hints offered this session
let lastHintOfferedAt  = 0;    // timestamp of last hint offer
const HINT_THRESHOLDS  = [20 * 60 * 1000, 30 * 60 * 1000, 40 * 60 * 1000]; // 20, 30, 40 min

// ── Contest Mode State ───────────────────────────────────────────────────────
let contestModeActive    = false;
let contestEndTime: number | null = null;
let contestStatusBar: vscode.StatusBarItem | null = null;
let contestTimerInterval: NodeJS.Timeout | null   = null;

// ── Bug Pattern Tracker ───────────────────────────────────────────────────────
let bugTracker: BugPatternTracker | null = null;


// ── Panel References ──────────────────────────────────────────────────────────
let testViewProvider:    TestViewProvider;
let problemPanelProvider: ProblemPanel;
let dnaLivePanelProvider: DNALivePanel;
let historyPanelProvider: HistoryPanel;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWorkspacePath(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

function mycpcDir(): string | null {
  const ws = getWorkspacePath();
  return ws ? path.join(ws, '.mycpc') : null;
}

function ensureMycpcDir() {
  const d = mycpcDir();
  if (d && !fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function getCppTemplate(problemPayload: ProblemMeta): string {
  const tplPath = vscode.workspace.getConfiguration('mycpc').get<string>('templatePath');
  if (tplPath && fs.existsSync(tplPath)) return fs.readFileSync(tplPath, 'utf8');
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

function startSession(problemName: string, config: ProblemMeta, workspacePath: string) {
  activeProblem = problemName;
  activeProblemConfig = config;
  sessionStartedAt = Date.now();
  sessionEvents = [{ timestamp: Date.now(), event: 'session_start', problem_name: problemName }];
  codeSnapshots = [];
  lastEditTimestamps = [];

  const dir = ensureMycpcDir()!;
  activeSessionFile = path.join(dir, `session_${problemName}.json`);
  fs.writeFileSync(activeSessionFile, JSON.stringify([]));

  // Determine active source file
  const lang = vscode.workspace.getConfiguration('mycpc').get<string>('language') || 'cpp';
  const extMap: Record<string, string> = { cpp: '.cpp', python: '.py', java: '.java', rust: '.rs' };
  activeSourceFile = path.join(workspacePath, `${problemName}${extMap[lang] || '.cpp'}`);

  // Snapshot every 30s
  if (snapshotInterval) clearInterval(snapshotInterval);
  snapshotInterval = setInterval(takeCodeSnapshot, 30000);

  // Timer tick every second → updates DNA Live panel
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - sessionStartedAt) / 1000);
    const waCount = sessionEvents.filter(e => e.event === 'test_result' && e.verdict === 'WA').length;
    const tleCount = sessionEvents.filter(e => e.event === 'test_result' && e.verdict === 'TLE').length;
    const compAttempts = sessionEvents.filter(e => e.event === 'test_run').length;
    const heuristics = SessionAnalyzer.analyzePartial(sessionEvents);

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

  // Start hint monitor
  startHintMonitor();

  // Initialize test view with the loaded tests
  testViewProvider.updateState({
    globalStatus: 'Idle',
    lang: MultiLangRunner.langLabel(MultiLangRunner.detectLanguage(activeSourceFile)),
    timeLimit: config.timeLimit,
    problemName: config.name,
    compilationError: '',
    tests: (config.tests || []).map(t => ({
      input: t.input,
      expectedOutput: t.output,
      actualOutput: '',
      stderr: '',
      status: 'Pending' as const,
      time: 0
    }))
  });
}

function stopSession() {
  if (!activeProblem) return;
  flushChanges();
  if (snapshotInterval) { clearInterval(snapshotInterval); snapshotInterval = null; }
  if (timerInterval)    { clearInterval(timerInterval); timerInterval = null; }
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
  stopHintMonitor();
}

function takeCodeSnapshot() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !activeProblem) return;
  const code = editor.document.getText();
  codeSnapshots.push({ timestamp: Date.now(), codeLength: code.length, lineCount: editor.document.lineCount, code });
  sessionEvents.push({ timestamp: Date.now(), event: 'snapshot', code_length: code.length });
}

function flushChanges() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (!activeSessionFile || sessionEvents.length === 0) return;
  try { fs.writeFileSync(activeSessionFile, JSON.stringify(sessionEvents, null, 2)); }
  catch (e) { console.error('[myCPC] flush error:', e); }
}

// ── DNA Analysis Trigger ──────────────────────────────────────────────────────

async function triggerAnalysis(context: vscode.ExtensionContext) {
  if (!activeProblem || !activeProblemConfig) {
    vscode.window.showWarningMessage('myCPC: No active session to analyze.');
    return;
  }

  const cfHandle = vscode.workspace.getConfiguration('mycpc').get<string>('cfHandle') || 'unknown';
  const editor = vscode.window.activeTextEditor;
  const finalCode = editor ? editor.document.getText() : '';

  sessionEvents.push({ timestamp: Date.now(), event: 'test_result', verdict: 'AC' });
  flushChanges();

  const summary = SessionAnalyzer.buildSummary(
    activeProblem, activeProblemConfig, sessionEvents, codeSnapshots, finalCode
  );

  statusBarItem.text = `$(loading~spin) myCPC: Analyzing DNA...`;

  const reportPanel = ReportPanel.createOrShow(context.extensionUri);
  reportPanel.showLoading(activeProblem);

  // Update DNA live panel to "analysis ready" state
  dnaLivePanelProvider.update({ analysisReady: true, sessionActive: true });

  const userGeminiKey = vscode.workspace.getConfiguration('mycpc').get<string>('geminiApiKey') || '';

  try {
    const result = await ReportGenerator.generateReport(cfHandle, summary);

    if (result.error) {
      reportPanel.showError(result.error);
      statusBarItem.text = `$(error) myCPC: Analysis Failed`;
      vscode.window.showWarningMessage(`myCPC DNA: ${result.error}`);
    } else {
      reportPanel.showReport(result, summary);
      statusBarItem.text = `$(check) myCPC: DNA Report Ready`;
      dnaLivePanelProvider.update({ quotaRemaining: result.quotaRemaining ?? 10 });

      // Refresh history
      loadHistory();

      if ((result.quotaRemaining ?? 10) <= 2) {
        vscode.window.showWarningMessage(
          `⚠️ myCPC: Only ${result.quotaRemaining} free analyses left this month.`,
          'Add Gemini Key'
        ).then(action => {
          if (action === 'Add Gemini Key') vscode.commands.executeCommand('workbench.action.openSettings', 'mycpc.geminiApiKey');
        });
      }
    }
  } catch (e: any) {
    reportPanel.showError(`Backend unreachable: ${e.message}`);
    statusBarItem.text = `$(error) myCPC: Backend Offline`;
  }

  stopSession();
}

// ── Test Running ──────────────────────────────────────────────────────────────

async function runAllTests(context: vscode.ExtensionContext) {
  const ws = getWorkspacePath();
  if (!ws) { vscode.window.showErrorMessage('myCPC: No workspace open.'); return; }

  // Auto-infer problem from open file if not active
  if (!activeProblem) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage('myCPC: No active problem or open file.'); return; }
    const basename = path.basename(editor.document.fileName, path.extname(editor.document.fileName));
    const cfg = path.join(ws, '.mycpc', `problem_${basename}.json`);
    if (fs.existsSync(cfg)) {
      const config = JSON.parse(fs.readFileSync(cfg, 'utf8'));
      startSession(basename, config, ws);
    } else {
      vscode.window.showWarningMessage('myCPC: No problem config found. Fetch a problem via Competitive Companion first.');
      return;
    }
  }

  const sourceFile = activeSourceFile || path.join(ws, `${activeProblem}.cpp`);
  const outDir = ensureMycpcDir()!;
  const config = activeProblemConfig!;
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
    tests: tests.map(t => ({ input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending' as const, time: 0 }))
  });

  const lang = MultiLangRunner.detectLanguage(sourceFile);
  const timeLimitMs = config.timeLimit || 2000;

  // Compile
  const compileResult = await MultiLangRunner.compile(sourceFile, outDir, lang);
  if (!compileResult.success) {
    testViewProvider.updateState({ globalStatus: 'Compilation Error', compilationError: compileResult.error || '' });
    vscode.window.showErrorMessage(`myCPC: Compilation failed — check the Test Cases panel.`);
    return;
  }

  testViewProvider.updateState({ globalStatus: 'Running Tests...' });

  // Run tests
  const { results } = await MultiLangRunner.compileAndRunAll(
    sourceFile, outDir, tests, timeLimitMs,
    (index, result) => {
      // Log each result
      sessionEvents.push({ timestamp: Date.now(), event: 'test_result', verdict: result.status });
      testViewProvider.updateTestResult(index, {
        status: result.status,
        actualOutput: result.actualOutput,
        stderr: result.stderr,
        time: result.time
      });
    }
  );

  testViewProvider.updateState({ globalStatus: 'Finished' });

  // Check all AC
  const allAC = results.length > 0 && results.every(r => r.status === 'AC');
  const autoAnalyze = vscode.workspace.getConfiguration('mycpc').get<boolean>('autoAnalyzeOnAC') ?? true;

  if (allAC && autoAnalyze) {
    await triggerAnalysis(context);
  }
}

// ── History Loader ────────────────────────────────────────────────────────────

async function loadHistory() {
  const cfHandle = vscode.workspace.getConfiguration('mycpc').get<string>('cfHandle') || '';
  if (!cfHandle) return;

  const backendUrl = getBackendUrl();
  historyPanelProvider.setLoading(true);

  try {
    const data: any = await new Promise((resolve, reject) => {
      const url = new URL(`${backendUrl}/api/dna/history/${cfHandle}?limit=20`);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : require('http');
      const req = client.get(url.toString(), (res: any) => {
        let body = '';
        res.on('data', (c: any) => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
    });

    if (data.success) {
      const entries: HistoryEntry[] = data.history.map((h: any) => ({
        sessionId: h.session_id,
        problemName: h.problem_name,
        date: h.generated_at,
        totalTimeSec: h.total_time_sec,
        waCount: h.wa_count,
        status: 'solved' as const,
        dnaAxes: h.dna_axes,
        styleSignals: h.style_signals
      }));
      historyPanelProvider.setHistory(entries, cfHandle);
    }
  } catch (e) {
    historyPanelProvider.setLoading(false);
  }
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  console.log('[myCPC] v3 activated — Full CP Environment + DNA Coach');

  // ── Register 4 Sidebar Panels ─────────────────────────────────────────────
  testViewProvider     = new TestViewProvider();
  problemPanelProvider = new ProblemPanel();
  dnaLivePanelProvider = new DNALivePanel();
  historyPanelProvider = new HistoryPanel();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TestViewProvider.viewType, testViewProvider),
    vscode.window.registerWebviewViewProvider(ProblemPanel.viewType, problemPanelProvider),
    vscode.window.registerWebviewViewProvider(DNALivePanel.viewType, dnaLivePanelProvider),
    vscode.window.registerWebviewViewProvider(HistoryPanel.viewType, historyPanelProvider)
  );

  // Wire panel callbacks
  testViewProvider.onRunAll     = () => runAllTests(context);
  testViewProvider.onRunSingle  = (i) => runSingleTest(i, context);
  testViewProvider.onAddTest    = () => addTestCase();
  testViewProvider.onDeleteTest = (i) => deleteTestCase(i);
  testViewProvider.onEditTest   = (i) => editTestCase(i);
  testViewProvider.onStressTest = () => runStressTest();

  problemPanelProvider.onSubmit = () => submitToCF();

  dnaLivePanelProvider.onOpenReport  = () => ReportPanel.createOrShow(context.extensionUri);
  dnaLivePanelProvider.onAnalyzeNow  = () => triggerAnalysis(context);

  historyPanelProvider.onOpenSession = (sessionId) => openHistoryReport(sessionId, context);
  historyPanelProvider.onRefresh     = () => loadHistory();

  // ── Status Bar ────────────────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = `$(zap) myCPC`;
  statusBarItem.command = 'mycpc.openReport';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Deep Edit Tracker ─────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!activeProblem || event.document.uri.scheme !== 'file') return;

      const codeLength = event.document.getText().length;
      const changes = event.contentChanges.map(c => ({
        range: `${c.range.start.line}:${c.range.start.character}`,
        textLength: c.text.length,
        deleted: c.rangeLength
      }));

      const now = Date.now();
      // Track individual character additions for velocity
      const charsAdded = event.contentChanges.reduce((sum, c) => sum + c.text.length, 0);
      for (let i = 0; i < Math.min(charsAdded, 20); i++) lastEditTimestamps.push(now);

      sessionEvents.push({ timestamp: now, event: 'edit', code_length: codeLength, diff_summary: changes });

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushChanges, 5000);
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  const cmds: [string, (...args: any[]) => any][] = [
    ['mycpc.runTests',         () => runAllTests(context)],
    ['mycpc.stopSession',      () => { stopSession(); vscode.window.showInformationMessage('myCPC: Session stopped.'); }],
    ['mycpc.analyzeSession',   () => triggerAnalysis(context)],
    ['mycpc.openReport',       () => ReportPanel.createOrShow(context.extensionUri)],
    ['mycpc.addTestCase',      () => addTestCase()],
    ['mycpc.deleteTestCase',   () => vscode.window.showInputBox({ prompt: 'Test number to delete (1-based)' }).then(v => { if (v) deleteTestCase(parseInt(v) - 1); })],
    ['mycpc.stressTest',       () => runStressTest()],
    ['mycpc.submitCF',         () => submitToCF()],
    ['mycpc.openSettings',     () => vscode.commands.executeCommand('workbench.action.openSettings', 'mycpc')],
    ['mycpc.openDashboard',    () => {
      const url = getBackendUrl().replace(':3002', ':5173') + '/dna';
      vscode.env.openExternal(vscode.Uri.parse(url));
    }],
    ['mycpc.setLanguage', async () => {
      const lang = await vscode.window.showQuickPick(['C++17', 'Python3', 'Java', 'Rust'], { placeHolder: 'Select language' });
      if (lang) {
        const map: Record<string, string> = { 'C++17': 'cpp', 'Python3': 'python', 'Java': 'java', 'Rust': 'rust' };
        await vscode.workspace.getConfiguration('mycpc').update('language', map[lang], vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`myCPC: Language set to ${lang}`);
      }
    }],
    // ── Panel focus commands (bring a specific panel into view) ────────────
    ['mycpc.openProblem',  () => vscode.commands.executeCommand('mycpc.problemView.focus')],
    ['mycpc.openHistory',  () => vscode.commands.executeCommand('mycpc.historyView.focus')],
    ['mycpc.openDNA',      () => vscode.commands.executeCommand('mycpc.dnaView.focus')],
    // ── Stress test file helpers ───────────────────────────────────────────
    ['mycpc.openBruteFile', async () => {
      const file = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, openLabel: 'Set Brute Force File', filters: { 'Source Files': ['cpp','py','java','rs'] } });
      if (file?.[0]) {
        await vscode.workspace.getConfiguration('mycpc').update('_bruteFile', file[0].fsPath, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`myCPC: Brute force file set → ${path.basename(file[0].fsPath)}`);
      }
    }],
    ['mycpc.generateTests', () => runStressTest()],   // alias for stress test
    // ── Import test cases from a CF problem URL ────────────────────────────
    ['mycpc.importFromUrl', () => importTestsFromUrl()],
    // ── Problem statement viewer ───────────────────────────────────────────
    ['mycpc.viewProblemStatement', () => viewProblemStatement(context)],
    // ── Progressive Hint System ────────────────────────────────────────────
    ['mycpc.getHint', () => offerProgressiveHint(context)],
    // ── Contest Mode ───────────────────────────────────────────────────────
    ['mycpc.startContestMode', () => startContestMode()],
    ['mycpc.stopContestMode',  () => stopContestMode()],
    // ── Bug Pattern Tracker ───────────────────────────────────────────────
    ['mycpc.showBugPatterns', () => showBugPatterns()],
  ];

  cmds.forEach(([id, fn]) => context.subscriptions.push(vscode.commands.registerCommand(id, fn)));

  // ── Load initial history ──────────────────────────────────────────────────
  loadHistory();

  // ── Initialize Bug Pattern Tracker ───────────────────────────────────────
  const cfHandle = vscode.workspace.getConfiguration('mycpc').get<string>('cfHandle') || '';
  const backendUrl = getBackendUrl();
  bugTracker = new BugPatternTracker();
  if (cfHandle) {
    bugTracker.init(cfHandle, backendUrl);
  }

  // Analyze documents as they open/change
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => bugTracker?.analyzeDocument(doc)),
    vscode.workspace.onDidSaveTextDocument(doc => bugTracker?.analyzeDocument(doc)),
  );

  // Analyze currently open editors
  vscode.window.visibleTextEditors.forEach(e => bugTracker?.analyzeDocument(e.document));
  context.subscriptions.push(bugTracker!);

  // ── Start Competitive Companion Listener ──────────────────────────────────
  startCCServer(context);
}

// ── Test Case Management ──────────────────────────────────────────────────────

async function addTestCase() {
  if (!activeProblemConfig) {
    vscode.window.showWarningMessage('myCPC: No active problem. Fetch one via Competitive Companion first.');
    return;
  }

  const input  = await vscode.window.showInputBox({ prompt: 'Enter test case input (use \\n for newlines)', placeHolder: '1 2 3' });
  if (input === undefined) return;
  const output = await vscode.window.showInputBox({ prompt: 'Enter expected output', placeHolder: '6' });
  if (output === undefined) return;

  const realInput  = input.replace(/\\n/g, '\n');
  const realOutput = output.replace(/\\n/g, '\n');

  activeProblemConfig.tests.push({ input: realInput, output: realOutput });
  saveConfig();

  testViewProvider.updateState({
    tests: activeProblemConfig.tests.map(t => ({
      input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending' as const, time: 0
    }))
  });

  vscode.window.showInformationMessage(`myCPC: Added test case #${activeProblemConfig.tests.length}`);
}

function deleteTestCase(index: number) {
  if (!activeProblemConfig || index < 0 || index >= activeProblemConfig.tests.length) return;
  activeProblemConfig.tests.splice(index, 1);
  saveConfig();

  testViewProvider.updateState({
    tests: activeProblemConfig.tests.map(t => ({
      input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending' as const, time: 0
    }))
  });
}

function saveConfig() {
  if (!activeProblem || !activeProblemConfig) return;
  const dir = mycpcDir();
  if (!dir) return;
  const cfgPath = path.join(dir, `problem_${activeProblem}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(activeProblemConfig, null, 2));
}

// ── Edit Test Case ────────────────────────────────────────────────────────────

async function editTestCase(index: number) {
  if (!activeProblemConfig || index < 0 || index >= activeProblemConfig.tests.length) return;
  const existing = activeProblemConfig.tests[index];

  const newInput = await vscode.window.showInputBox({
    prompt: `Edit input for Test ${index + 1}`,
    value: existing.input.replace(/\n/g, '\\n'),
    placeHolder: 'Use \\n for newlines'
  });
  if (newInput === undefined) return;

  const newOutput = await vscode.window.showInputBox({
    prompt: `Edit expected output for Test ${index + 1}`,
    value: existing.output.replace(/\n/g, '\\n'),
    placeHolder: 'Expected output'
  });
  if (newOutput === undefined) return;

  activeProblemConfig.tests[index] = {
    input:  newInput.replace(/\\n/g, '\n'),
    output: newOutput.replace(/\\n/g, '\n')
  };
  saveConfig();

  testViewProvider.updateState({
    tests: activeProblemConfig.tests.map(t => ({
      input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending' as const, time: 0
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
    if (!input) return;
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
        input: t.input, expectedOutput: t.output, actualOutput: '', stderr: '', status: 'Pending' as const, time: 0
      }))
    });

    statusBarItem.text = `$(check) myCPC: Imported ${added} tests`;
    vscode.window.showInformationMessage(`myCPC: Imported ${added} new sample test(s) from URL.`);
  } catch (e: any) {
    statusBarItem.text = `$(error) myCPC: Import failed`;
    vscode.window.showErrorMessage(`myCPC: Failed to fetch tests — ${e.message}`);
  }
}

/** Fetch plain HTML from a URL (no JS execution — CF sample tests are SSR) */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client: typeof https = isHttps ? https : (http as any);
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (myCPC/3.0)',
        'Accept': 'text/html'
      }
    }, (res: http.IncomingMessage) => {
      // Follow single redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        res.resume();
        return;
      }
      let body = '';
      res.on('data', (c: any) => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
  });
}

/** Scrape sample tests from Codeforces / CSES HTML using regex */
function scrapeTests(html: string): { input: string; output: string }[] {
  const tests: { input: string; output: string }[] = [];

  // Codeforces: <div class="input"><div class="title">Input</div><pre>...</pre></div>
  const cfInputRe  = /<div class="input">[\s\S]*?<pre>([\s\S]*?)<\/pre>/gi;
  const cfOutputRe = /<div class="output">[\s\S]*?<pre>([\s\S]*?)<\/pre>/gi;

  const inputs:  string[] = [];
  const outputs: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = cfInputRe.exec(html))  !== null) inputs.push(cleanHtml(m[1]));
  while ((m = cfOutputRe.exec(html)) !== null) outputs.push(cleanHtml(m[1]));

  // Pair them up
  const count = Math.min(inputs.length, outputs.length);
  for (let i = 0; i < count; i++) {
    tests.push({ input: inputs[i], output: outputs[i] });
  }

  return tests;
}

function cleanHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .trim() + '\n';
}

// ── Problem Statement Viewer ───────────────────────────────────────────────────

function viewProblemStatement(context: vscode.ExtensionContext) {
  if (!activeProblemConfig?.url) {
    vscode.window.showWarningMessage('myCPC: No problem loaded. Fetch one via Competitive Companion first.');
    return;
  }

  const url = activeProblemConfig.url;
  const problemName = activeProblemConfig.name || 'Problem';

  const panel = vscode.window.createWebviewPanel(
    'mycpcProblem',
    `📋 ${problemName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

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

async function runSingleTest(index: number, context: vscode.ExtensionContext) {
  const ws = getWorkspacePath();
  if (!ws || !activeProblem || !activeProblemConfig) return;
  const sourceFile = activeSourceFile || path.join(ws, `${activeProblem}.cpp`);
  const outDir = ensureMycpcDir()!;
  const lang = MultiLangRunner.detectLanguage(sourceFile);
  const test = activeProblemConfig.tests[index];
  if (!test) return;

  testViewProvider.updateTestResult(index, { status: 'Running', actualOutput: '', stderr: '' });

  const compileResult = await MultiLangRunner.compile(sourceFile, outDir, lang);
  if (!compileResult.success) {
    testViewProvider.updateState({ globalStatus: 'Compilation Error', compilationError: compileResult.error || '' });
    return;
  }

  const result = await MultiLangRunner.run(sourceFile, outDir, lang, test.input, activeProblemConfig.timeLimit || 2000);
  const expected = MultiLangRunner._normalize(test.output);
  const actual   = MultiLangRunner._normalize(result.stdout);
  const status   = result.tle ? 'TLE' : result.code !== 0 ? 'RE' : expected === actual ? 'AC' : 'WA';

  testViewProvider.updateTestResult(index, { status, actualOutput: result.stdout, stderr: result.stderr, time: result.time });
}

// ── Stress Test ───────────────────────────────────────────────────────────────

async function runStressTest() {
  const ws = getWorkspacePath();
  if (!ws || !activeProblem) { vscode.window.showWarningMessage('myCPC: No active problem.'); return; }

  const solutionFile = activeSourceFile || path.join(ws, `${activeProblem}.cpp`);

  const bruteFile = await vscode.window.showOpenDialog({
    canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
    openLabel: 'Select Brute Force File',
    filters: { 'Source Files': ['cpp', 'py', 'java', 'rs'] }
  });
  if (!bruteFile) return;

  const genFile = await vscode.window.showOpenDialog({
    canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
    openLabel: 'Select Generator File',
    filters: { 'Source Files': ['cpp', 'py', 'java', 'rs'] }
  });
  if (!genFile) return;

  const iterations = vscode.workspace.getConfiguration('mycpc').get<number>('stressTestCount') || 100;
  const timeLimitMs = activeProblemConfig?.timeLimit || 2000;

  stressSignal = { aborted: false };
  testViewProvider.updateState({ globalStatus: 'Stress Test' });

  statusBarItem.text = `$(loading~spin) myCPC: Stress Testing...`;

  const stressResult = await StressTest.run(
    ws, solutionFile, bruteFile[0].fsPath, genFile[0].fsPath,
    iterations, timeLimitMs,
    (progress) => {
      statusBarItem.text = `$(loading~spin) myCPC: Stress ${progress.current}/${progress.total}`;
    },
    stressSignal
  );

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
  } else {
    statusBarItem.text = `$(error) myCPC: Stress FAIL`;
    vscode.window.showWarningMessage(`myCPC: Stress test found a mismatch on test ${stressResult.testIndex}! Check Test Cases panel.`);
  }
}

// ── CF Submit ─────────────────────────────────────────────────────────────────

async function submitToCF() {
  const cfHandle = vscode.workspace.getConfiguration('mycpc').get<string>('cfHandle');
  const jsessionid = vscode.workspace.getConfiguration('mycpc').get<string>('cfJsessionid');
  const csrf = vscode.workspace.getConfiguration('mycpc').get<string>('cfCsrfToken');

  if (!cfHandle || !jsessionid || !csrf) {
    const action = await vscode.window.showErrorMessage(
      'myCPC: CF credentials not configured. Set cfHandle, cfJsessionid, and cfCsrfToken in settings.',
      'Open Settings'
    );
    if (action === 'Open Settings') vscode.commands.executeCommand('workbench.action.openSettings', 'mycpc');
    return;
  }

  if (!activeProblemConfig?.contestId || !activeProblemConfig?.problemIndex) {
    vscode.window.showWarningMessage('myCPC: This problem has no contest/problem index. CF submit only works for Codeforces problems.');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showWarningMessage('myCPC: No active editor.'); return; }
  const sourceCode = editor.document.getText();
  const lang = MultiLangRunner.detectLanguage(editor.document.fileName);

  statusBarItem.text = `$(loading~spin) myCPC: Submitting...`;
  problemPanelProvider.setSubmitStatus('Submitting...');

  const result = await CFSubmitter.submit(
    activeProblemConfig.contestId,
    activeProblemConfig.problemIndex,
    sourceCode,
    lang,
    (status) => {
      statusBarItem.text = `$(loading~spin) myCPC: ${status}`;
      problemPanelProvider.setSubmitStatus(status);
    }
  );

  if (!result.success) {
    statusBarItem.text = `$(error) myCPC: Submit Failed`;
    problemPanelProvider.setSubmitStatus(result.error || 'Submit failed', 'Failed');
    vscode.window.showErrorMessage(`myCPC Submit: ${result.error}`);
    return;
  }

  const verdictText = result.verdict || 'Unknown';
  const isAC = verdictText === 'Accepted';

  statusBarItem.text = isAC ? `$(check) myCPC: Accepted ✓` : `$(warning) myCPC: ${verdictText}`;
  problemPanelProvider.setSubmitStatus(
    isAC ? `Passed ${result.passedTests} tests` : `Failed on test ${(result.passedTests || 0) + 1}`,
    verdictText
  );

  vscode.window.showInformationMessage(
    `myCPC CF Submit: ${verdictText}` + (result.submissionId ? ` (#${result.submissionId})` : '')
  );
}

// ── History Report Opener ─────────────────────────────────────────────────────

async function openHistoryReport(sessionId: number, context: vscode.ExtensionContext) {
  const reportPanel = ReportPanel.createOrShow(context.extensionUri);
  reportPanel.showLoading('Loading...');
  const result = await ReportGenerator.fetchReport(sessionId);
  if (result) {
    // Build a minimal summary for display purposes
    const dummySummary = {
      problemName: (result as any).report?.problem_name || 'Unknown',
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
    reportPanel.showReport(result as any, dummySummary as any);
  } else {
    reportPanel.showError('Could not load this report from the backend.');
  }
}

// ── Competitive Companion Server ──────────────────────────────────────────────

function startCCServer(context: vscode.ExtensionContext) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/', (req: express.Request, res: express.Response) => {
    const payload = req.body;
    const ws = getWorkspacePath();

    if (!ws) {
      vscode.window.showErrorMessage('myCPC: Open a folder before fetching problems.');
      return res.status(400).json({ error: 'No workspace' });
    }

    const rawName = payload.name || 'Unknown_Problem';
    const problemName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/__+/g, '_').slice(0, 60);

    try {
      const dir = ensureMycpcDir()!;

      // Save config
      const cfgPath = path.join(dir, `problem_${problemName}.json`);
      fs.writeFileSync(cfgPath, JSON.stringify(payload, null, 2));

      // Create source file
      const lang = vscode.workspace.getConfiguration('mycpc').get<string>('language') || 'cpp';
      const extMap: Record<string, string> = { cpp: '.cpp', python: '.py', java: '.java', rust: '.rs' };
      const srcFile = path.join(ws, `${problemName}${extMap[lang] || '.cpp'}`);
      if (!fs.existsSync(srcFile)) {
        fs.writeFileSync(srcFile, getCppTemplate(payload));
      }

      // Cast payload to ProblemMeta (CC payload structure is compatible)
      const meta: ProblemMeta = {
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

      vscode.window.showInformationMessage(
        `🧬 myCPC: "${payload.name}" loaded — ${(payload.tests || []).length} sample tests. DNA tracking started!`,
        'Run Tests'
      ).then(action => { if (action === 'Run Tests') vscode.commands.executeCommand('mycpc.runTests'); });

      res.sendStatus(200);
    } catch (e: any) {
      vscode.window.showErrorMessage(`myCPC: Error loading problem — ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  ccServer = http.createServer(app);
  ccServer.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      vscode.window.showWarningMessage(`myCPC: Port ${getListenerPort()} in use. Is another CPH instance running?`);
    }
  });
  ccServer.listen(getListenerPort(), '127.0.0.1', () => {
    console.log(`[myCPC] Competitive Companion listener ready on port ${getListenerPort()}`);
  });
}

// ── Deactivate ────────────────────────────────────────────────────────────────

export function deactivate() {
  flushChanges();
  if (snapshotInterval) clearInterval(snapshotInterval);
  if (timerInterval) clearInterval(timerInterval);
  if (hintCheckInterval) clearInterval(hintCheckInterval);
  if (contestTimerInterval) clearInterval(contestTimerInterval);
  if (ccServer) ccServer.close();
  bugTracker?.dispose();
}

// ── Progressive Hint System ───────────────────────────────────────────────────

function startHintMonitor() {
  hintsOffered = 0;
  lastHintOfferedAt = 0;

  if (hintCheckInterval) clearInterval(hintCheckInterval);
  hintCheckInterval = setInterval(() => {
    if (!activeProblem || !sessionStartedAt) return;

    const elapsed = Date.now() - sessionStartedAt;
    const threshold = HINT_THRESHOLDS[hintsOffered] ?? null;
    if (threshold === null) return; // All hints exhausted

    // Check if user is stuck (no recent AC, elapsed > threshold)
    const hasAC = sessionEvents.some(e => e.event === 'test_result' && e.verdict === 'AC');
    if (hasAC) {
      clearInterval(hintCheckInterval!);
      hintCheckInterval = null;
      return;
    }

    const timeSinceLastHint = lastHintOfferedAt ? Date.now() - lastHintOfferedAt : Infinity;

    if (elapsed >= threshold && timeSinceLastHint > 9 * 60 * 1000) {
      offerProgressiveHint(undefined);
    }
  }, 60000); // Check every minute
}

function stopHintMonitor() {
  if (hintCheckInterval) { clearInterval(hintCheckInterval); hintCheckInterval = null; }
  hintsOffered = 0;
}

async function offerProgressiveHint(context: vscode.ExtensionContext | undefined) {
  if (!activeProblem || !activeProblemConfig) {
    vscode.window.showInformationMessage('myCPC: Start a problem session first to get hints.');
    return;
  }

  const elapsed = Math.round((Date.now() - sessionStartedAt) / 60000);
  const hintLevel = Math.min(hintsOffered + 1, 3);
  const hintDescriptions = [
    'Subtle nudge (data structure / invariant)',
    'Points at the algorithmic bottleneck',
    'Names the exact technique gap'
  ];

  const action = await vscode.window.showInformationMessage(
    `🧬 myCPC: You've been on "${activeProblem}" for ${elapsed} min. Want a Hint ${hintLevel}/3?`,
    `Get Hint ${hintLevel}/3`,
    `Skip`,
    `Give Up (Full Approach)`
  );

  if (action === `Skip`) return;

  if (action === `Give Up (Full Approach)`) {
    // Log as editorial_used
    sessionEvents.push({ timestamp: Date.now(), event: 'editorial_used', hintLevel: 4 });
    const cfHandle = vscode.workspace.getConfiguration('mycpc').get<string>('cfHandle') || '';
    const problemUrl = `https://codeforces.com/contest/${activeProblemConfig.contestId}/problem/${activeProblemConfig.problemIndex}`;
    vscode.env.openExternal(vscode.Uri.parse(`https://codeforces.com/blog/search?query=${encodeURIComponent(activeProblem)}`));
    return;
  }

  // Get hint from backend
  const cfHandle = vscode.workspace.getConfiguration('mycpc').get<string>('cfHandle') || '';
  const backendUrl = getBackendUrl();
  const nvidiaKey = vscode.workspace.getConfiguration('mycpc').get<string>('nvidiaApiKey') || '';

  const editor = vscode.window.activeTextEditor;
  const userCode = editor?.document.getText() || '';

  sessionEvents.push({ timestamp: Date.now(), event: 'hint_requested', hintLevel });
  lastHintOfferedAt = Date.now();
  hintsOffered++;

  if (!nvidiaKey) {
    // Offer built-in hints without LLM
    const builtInHints = [
      `Hint 1: Think about what invariant holds throughout your algorithm.`,
      `Hint 2: Consider the time complexity — can you reduce from O(n²) with a smarter data structure?`,
      `Hint 3: This looks like a ${activeProblemConfig.tags?.[0] || 'greedy/DP'} problem. Focus on the optimal substructure.`
    ];
    vscode.window.showInformationMessage(
      `💡 myCPC Hint ${hintLevel}/3: ${builtInHints[hintLevel - 1]}`,
      'Got it'
    );
    return;
  }

  // Fetch AI hint
  try {
    const body = JSON.stringify({
      problemStatement: `${activeProblem} (CF problem)`,
      userCode,
      hintLevel,
      prevHints: [],
      nvidiaKey
    });

    const res = await fetch(`${backendUrl}/api/coach/hint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (res.ok) {
      const data = await res.json() as any;
      if (data.hint) {
        vscode.window.showInformationMessage(
          `💡 myCPC Hint ${hintLevel}/3: ${data.hint}`,
          'Got it',
          'Another Hint'
        ).then(a => {
          if (a === 'Another Hint' && hintsOffered < 3) offerProgressiveHint(context);
        });
        return;
      }
    }
  } catch { /* LLM offline */ }

  vscode.window.showInformationMessage(`myCPC: Could not fetch hint (backend offline). Set your Nvidia key in settings.`);
}

// ── Contest Mode ─────────────────────────────────────────────────────────────

async function startContestMode() {
  const input = await vscode.window.showInputBox({
    prompt: 'Enter contest end time (minutes from now, or HH:MM format)',
    placeHolder: '120 (for 2 hours) or 14:30 (for specific time)'
  });

  if (!input) return;

  let endTime: number;
  if (input.includes(':')) {
    // HH:MM format
    const [h, m] = input.split(':').map(Number);
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    if (end <= now) end.setDate(end.getDate() + 1); // tomorrow
    endTime = end.getTime();
  } else {
    const minutes = parseInt(input);
    if (isNaN(minutes) || minutes <= 0) {
      vscode.window.showErrorMessage('myCPC: Invalid duration.');
      return;
    }
    endTime = Date.now() + minutes * 60 * 1000;
  }

  contestModeActive = true;
  contestEndTime = endTime;

  // Create contest status bar item
  if (!contestStatusBar) {
    contestStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    contestStatusBar.command = 'mycpc.stopContestMode';
    contestStatusBar.tooltip = 'myCPC Contest Mode — click to stop';
  }
  contestStatusBar.show();

  // Start countdown
  if (contestTimerInterval) clearInterval(contestTimerInterval);
  const tick = () => {
    if (!contestEndTime || !contestStatusBar) return;
    const remaining = contestEndTime - Date.now();
    if (remaining <= 0) {
      contestStatusBar.text = `$(clock) 🏆 Contest Over!`;
      contestStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      clearInterval(contestTimerInterval!);
      vscode.window.showInformationMessage('myCPC: Contest time is up! Good luck with final submissions.', 'Stop Contest Mode')
        .then(a => { if (a) stopContestMode(); });
      return;
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    const timeStr = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
    const icon = remaining < 900000 ? '$(warning)' : '$(clock)';
    contestStatusBar.text = `${icon} 🏆 ${timeStr}`;
    contestStatusBar.backgroundColor = remaining < 900000
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : remaining < 1800000
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
  };
  tick();
  contestTimerInterval = setInterval(tick, 1000);

  vscode.window.showInformationMessage(`🏆 myCPC Contest Mode started! Timer running in status bar.`);
}

function stopContestMode() {
  contestModeActive = false;
  contestEndTime = null;
  if (contestTimerInterval) { clearInterval(contestTimerInterval); contestTimerInterval = null; }
  if (contestStatusBar) { contestStatusBar.hide(); }
  vscode.window.showInformationMessage('myCPC: Contest mode stopped.');
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

// ── Bug Pattern Display ───────────────────────────────────────────────────────

async function showBugPatterns() {
  if (!bugTracker) {
    vscode.window.showInformationMessage('myCPC: Bug tracker not initialized. Set your CF handle in settings.');
    return;
  }

  const patterns = bugTracker.getPatterns();
  if (patterns.length === 0) {
    vscode.window.showInformationMessage('myCPC: No recurring bug patterns detected yet. Solve at least 5 problems with myCPC tracking.');
    return;
  }

  const items = patterns.map(p => ({
    label: `⚠ ${p.pattern.replace(/_/g, ' ').toUpperCase()}`,
    description: `Seen in ${p.frequency} sessions`,
    detail: p.suggestion
  }));

  await vscode.window.showQuickPick(items, {
    title: '🧬 myCPC — Your Recurring Bug Patterns',
    placeHolder: 'These are patterns detected from your DNA session history'
  });
}

// Wire hint monitor into session start/stop
const _origStartSession = startSession;

