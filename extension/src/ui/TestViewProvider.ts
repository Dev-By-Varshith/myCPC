import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TestCase {
  input: string;
  output: string;
  label?: string;
}

export interface TestState {
  globalStatus: 'Idle' | 'Compiling...' | 'Running Tests...' | 'Finished' | 'Compilation Error' | 'Stress Test';
  lang: string;
  timeLimit: number;
  problemName: string;
  compilationError: string;
  tests: {
    input: string;
    expectedOutput: string;
    actualOutput: string;
    stderr: string;
    status: 'Pending' | 'Running' | 'AC' | 'WA' | 'TLE' | 'RE';
    time: number;
  }[];
  stressResult?: { passed: number; failed: number; failingInput?: string; bruteOutput?: string; optOutput?: string };
}

/**
 * TestViewProvider — Panel 1: Test Cases
 * 
 * Displays and manages test cases for the active problem.
 * Features:
 *  - Real-time status updates as each test runs
 *  - Add / Edit / Delete custom test cases
 *  - Diff view for WA (expected vs actual side-by-side)
 *  - Stress test result display
 *  - Language badge + time limit display
 *  - Messages back to extension: addTest, deleteTest, editTest, runAll, runSingle
 */
export class TestViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mycpc.testView';
  private _view?: vscode.WebviewView;
  private _state: TestState = {
    globalStatus: 'Idle',
    lang: 'C++17',
    timeLimit: 2000,
    problemName: '',
    compilationError: '',
    tests: []
  };

  // Callbacks registered by extension.ts
  public onAddTest?: () => void;
  public onDeleteTest?: (index: number) => void;
  public onEditTest?: (index: number) => void;
  public onRunAll?: () => void;
  public onRunSingle?: (index: number) => void;
  public onStressTest?: () => void;

  constructor() {}

  resolveWebviewView(webviewView: vscode.WebviewView, _ctx: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._buildHtml();

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'ready':        this._push(); break;
        case 'runAll':       this.onRunAll?.(); break;
        case 'runSingle':    this.onRunSingle?.(msg.index); break;
        case 'addTest':      this.onAddTest?.(); break;
        case 'deleteTest':   this.onDeleteTest?.(msg.index); break;
        case 'editTest':     this.onEditTest?.(msg.index); break;
        case 'stressTest':   this.onStressTest?.(); break;
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  public updateState(partial: Partial<TestState>) {
    this._state = { ...this._state, ...partial };
    this._push();
  }

  public updateTestResult(index: number, result: Partial<TestState['tests'][0]>) {
    if (this._state.tests[index]) {
      this._state.tests[index] = { ...this._state.tests[index], ...result };
      this._push();
    }
  }

  private _push() {
    this._view?.webview.postMessage({ command: 'update', state: this._state });
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  private _buildHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-sideBar-background);
    height: 100vh;
    overflow-y: auto;
    padding-bottom: 20px;
  }

  /* ── Header ── */
  .header {
    position: sticky; top: 0; z-index: 10;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 8px 10px;
  }
  .prob-line {
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 6px;
    overflow: hidden;
  }
  .prob-name { font-weight: 700; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .badge {
    font-size: 10px; font-family: monospace; padding: 1px 6px; border-radius: 4px;
    border: 1px solid; white-space: nowrap; flex-shrink: 0;
  }
  .badge-lang { color: #5ecfff; border-color: rgba(94,207,255,0.35); background: rgba(94,207,255,0.08); }
  .badge-tl   { color: #fbbf24; border-color: rgba(251,191,36,0.35); background: rgba(251,191,36,0.08); }

  /* ── Action Bar ── */
  .actions { display: flex; gap: 5px; flex-wrap: wrap; }
  .btn {
    padding: 4px 10px; border: none; border-radius: 4px; cursor: pointer;
    font-size: 11px; font-family: var(--vscode-font-family);
    transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-run   { background: #2ea043; color: #fff; }
  .btn-add   { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn-stress{ background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }

  /* ── Global Status ── */
  .status-bar {
    padding: 5px 10px; font-size: 11px; font-family: monospace;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorWidget-background);
    display: flex; align-items: center; gap: 6px;
  }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-idle     { background: #555; }
  .dot-running  { background: #fbbf24; animation: blink 1s infinite; }
  .dot-ok       { background: #4ade80; }
  .dot-err      { background: #f87171; }
  @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

  /* ── Test Cards ── */
  .tests { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .card {
    border-radius: 6px; border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorWidget-background);
    overflow: hidden;
  }
  .card-header {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 10px; cursor: pointer; user-select: none;
  }
  .card-header:hover { background: rgba(255,255,255,0.04); }
  .test-num { font-weight: 700; font-size: 11px; }
  .verdict {
    font-family: monospace; font-size: 11px; font-weight: 700;
    margin-left: auto; padding: 1px 8px; border-radius: 4px;
  }
  .v-ac  { color: #4ade80; background: rgba(74,222,128,0.12); }
  .v-wa  { color: #f87171; background: rgba(248,113,113,0.12); }
  .v-tle { color: #fbbf24; background: rgba(251,191,36,0.12); }
  .v-re  { color: #fb923c; background: rgba(251,146,60,0.12); }
  .v-run { color: #5ecfff; background: rgba(94,207,255,0.12); animation: blink 0.8s infinite; }
  .v-pend{ color: #64748b; background: rgba(100,116,139,0.12); }
  .time-label { font-size: 10px; color: #64748b; font-family: monospace; }

  /* ── Card Body ── */
  .card-body { border-top: 1px solid var(--vscode-panel-border); padding: 8px; display: none; }
  .card-body.open { display: block; }
  .section-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 6px 0 3px 0; }
  pre {
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px; padding: 6px 8px;
    font-size: 11px; overflow-x: auto;
    white-space: pre-wrap; word-break: break-all;
    max-height: 120px; overflow-y: auto;
    margin: 0; border: 1px solid var(--vscode-panel-border);
  }

  /* ── WA Diff ── */
  .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

  /* ── Delete btn ── */
  .del-btn {
    background: none; border: none; cursor: pointer;
    color: #64748b; font-size: 13px; line-height: 1;
    padding: 2px 4px; border-radius: 3px;
    flex-shrink: 0;
  }
  .del-btn:hover { color: #f87171; background: rgba(248,113,113,0.1); }

  /* ── Edit btn ── */
  .edit-btn {
    background: none; border: none; cursor: pointer;
    color: #64748b; font-size: 11px; padding: 2px 4px;
    border-radius: 3px; flex-shrink: 0;
  }
  .edit-btn:hover { color: #fbbf24; background: rgba(251,191,36,0.08); }

  /* ── Run single ── */
  .run-btn {
    background: none; border: none; cursor: pointer;
    color: #64748b; font-size: 11px; padding: 2px 4px;
    border-radius: 3px; flex-shrink: 0;
  }
  .run-btn:hover { color: #4ade80; background: rgba(74,222,128,0.08); }

  /* ── Empty state ── */
  .empty {
    text-align: center; padding: 32px 16px;
    color: #64748b; font-size: 12px; line-height: 1.7;
  }

  /* ── Stress result ── */
  .stress-box { padding: 10px; margin: 8px; border-radius: 6px; border: 1px solid; }
  .stress-pass { border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.06); }
  .stress-fail { border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.06); }

  /* ── Compile error ── */
  .compile-err { margin: 8px; border-radius: 6px; padding: 10px; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25); }
  .compile-err pre { background: transparent; border: none; color: #fca5a5; max-height: 200px; }
</style>
</head>
<body>
<!-- Header -->
<div class="header" id="header">
  <div class="prob-line">
    <span class="prob-name" id="probName">No problem loaded</span>
    <span class="badge badge-lang" id="langBadge">C++17</span>
    <span class="badge badge-tl" id="tlBadge">2s</span>
  </div>
  <div class="actions">
    <button class="btn btn-run" id="btnRunAll" onclick="runAll()">▶ Run All</button>
    <button class="btn btn-add" id="btnAdd" onclick="addTest()">＋ Add Test</button>
    <button class="btn btn-stress" id="btnStress" onclick="stressTest()">⚡ Stress</button>
  </div>
</div>

<!-- Status -->
<div class="status-bar">
  <div class="status-dot dot-idle" id="statusDot"></div>
  <span id="statusText">Waiting for problem...</span>
</div>

<!-- Body -->
<div id="body"></div>

<script>
  const vscode = acquireVsCodeApi();
  let openCards = new Set();

  window.addEventListener('message', e => {
    if (e.data.command === 'update') render(e.data.state);
  });

  vscode.postMessage({ command: 'ready' });

  function runAll()    { vscode.postMessage({ command: 'runAll' }); }
  function addTest()   { vscode.postMessage({ command: 'addTest' }); }
  function stressTest(){ vscode.postMessage({ command: 'stressTest' }); }

  function runSingle(i, e) {
    e.stopPropagation();
    vscode.postMessage({ command: 'runSingle', index: i });
  }

  function editTest(i, e) {
    e.stopPropagation();
    vscode.postMessage({ command: 'editTest', index: i });
  }

  function delTest(i, e) {
    e.stopPropagation();
    vscode.postMessage({ command: 'deleteTest', index: i });
  }

  function toggleCard(i) {
    if (openCards.has(i)) openCards.delete(i);
    else openCards.add(i);
    const body = document.getElementById('body-' + i);
    if (body) body.classList.toggle('open', openCards.has(i));
  }

  function render(s) {
    // Header
    const probName = document.getElementById('probName');
    if (probName) probName.textContent = s.problemName || 'No problem loaded';
    const langBadge = document.getElementById('langBadge');
    if (langBadge) langBadge.textContent = s.lang || 'C++17';
    const tlBadge = document.getElementById('tlBadge');
    if (tlBadge) tlBadge.textContent = (s.timeLimit >= 1000 ? (s.timeLimit/1000)+'s' : s.timeLimit+'ms');

    // Status dot
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');
    const dotClass = s.globalStatus === 'Finished' ? 'dot-ok'
                   : s.globalStatus.includes('Error') ? 'dot-err'
                   : s.globalStatus === 'Idle' ? 'dot-idle'
                   : 'dot-running';
    if (dot) dot.className = 'status-dot ' + dotClass;
    if (txt) txt.textContent = s.globalStatus;

    const body = document.getElementById('body');
    if (!body) return;

    // Compile error
    if (s.globalStatus === 'Compilation Error') {
      body.innerHTML = '<div class="compile-err"><div style="color:#f87171;font-size:11px;font-weight:700;margin-bottom:6px">COMPILATION ERROR</div><pre>' + esc(s.compilationError) + '</pre></div>';
      return;
    }

    // Stress result
    if (s.stressResult) {
      const sr = s.stressResult;
      const ok = !sr.failingInput;
      body.innerHTML += '<div class="stress-box ' + (ok ? 'stress-pass' : 'stress-fail') + '">'
        + '<div style="font-weight:700;font-size:11px;color:' + (ok ? '#4ade80' : '#f87171') + '">'
        + (ok ? '✅ All ' + sr.passed + ' stress tests passed!' : '❌ MISMATCH on test ' + (sr.passed + sr.failed))
        + '</div>'
        + (sr.failingInput ? '<div class="section-label">Failing Input</div><pre>' + esc(sr.failingInput) + '</pre>'
          + '<div class="diff-grid"><div><div class="section-label">Brute Output</div><pre>' + esc(sr.bruteOutput||'') + '</pre></div>'
          + '<div><div class="section-label">Your Output</div><pre>' + esc(sr.optOutput||'') + '</pre></div></div>' : '')
        + '</div>';
    }

    // No tests
    if (!s.tests || s.tests.length === 0) {
      body.innerHTML = '<div class="empty">No test cases.<br>Click <strong>＋ Add Test</strong> to create one,<br>or fetch a problem via Competitive Companion.</div>';
      return;
    }

    // Test cards
    let html = '<div class="tests">';
    s.tests.forEach((t, i) => {
      const vClass = { AC:'v-ac', WA:'v-wa', TLE:'v-tle', RE:'v-re', Running:'v-run', Pending:'v-pend' }[t.status] || 'v-pend';
      const vText  = { AC:'✓ AC', WA:'✗ WA', TLE:'⏱ TLE', RE:'⚡ RE', Running:'…', Pending:'—' }[t.status] || '—';
      const isOpen = openCards.has(i);

      html += '<div class="card">'
        + '<div class="card-header" onclick="toggleCard(' + i + ')">'  
        + '<span class="test-num">Test ' + (i+1) + '</span>'
        + '<button class="run-btn" onclick="runSingle(' + i + ', event)" title="Run this test">▷</button>'
        + '<button class="edit-btn" onclick="editTest(' + i + ', event)" title="Edit">✎</button>'
        + '<button class="del-btn" onclick="delTest(' + i + ', event)" title="Delete">✕</button>'
        + '<span class="verdict ' + vClass + '">' + vText + '</span>'
        + (t.time > 0 ? '<span class="time-label">' + t.time + 'ms</span>' : '')
        + '</div>'
        + '<div class="card-body' + (isOpen ? ' open' : '') + '" id="body-' + i + '">'
        + '<div class="section-label">Input</div>'
        + '<pre>' + esc(t.input) + '</pre>';

      if (t.status === 'WA') {
        html += '<div class="diff-grid">'
          + '<div><div class="section-label">Expected</div><pre>' + esc(t.expectedOutput) + '</pre></div>'
          + '<div><div class="section-label">Got</div><pre style="color:#f87171">' + esc(t.actualOutput) + '</pre></div>'
          + '</div>';
      } else if (t.status === 'AC') {
        html += '<div class="section-label">Output</div><pre style="color:#4ade80">' + esc(t.actualOutput) + '</pre>';
      } else if (t.expectedOutput) {
        html += '<div class="section-label">Expected</div><pre>' + esc(t.expectedOutput) + '</pre>';
      }

      if (t.stderr) {
        html += '<div class="section-label">Stderr</div><pre style="color:#fb923c">' + esc(t.stderr) + '</pre>';
      }

      html += '</div></div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
</script>
</body>
</html>`;
  }
}
