import * as vscode from 'vscode';

export interface LiveDNAState {
  sessionActive: boolean;
  problemName: string;
  elapsedSec: number;
  editVelocity: number;     // chars per minute (last 2 min window)
  hesitationCount: number;
  rewriteCount: number;
  waCount: number;
  tleCount: number;
  compilationAttempts: number;
  styleSignals: string[];
  tiltWarning: boolean;     // 3+ WAs in last 5 minutes
  analysisReady: boolean;   // post-AC analysis is done
  quotaRemaining: number;
}

/**
 * DNALivePanel — Panel 3: Real-Time Coding Coach
 *
 * Shows a live dashboard that updates every second during a session:
 *  - Running timer
 *  - Edit velocity meter (chars/min)
 *  - Hesitation pause counter
 *  - WA/TLE streak with tilt warning
 *  - Detected style signals
 *  - Post-AC: switches to a summary and "Open Full Report" button
 */
export class DNALivePanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mycpc.dnaView';
  private _view?: vscode.WebviewView;
  private _state: LiveDNAState = {
    sessionActive: false,
    problemName: '',
    elapsedSec: 0,
    editVelocity: 0,
    hesitationCount: 0,
    rewriteCount: 0,
    waCount: 0,
    tleCount: 0,
    compilationAttempts: 0,
    styleSignals: [],
    tiltWarning: false,
    analysisReady: false,
    quotaRemaining: 10
  };

  public onOpenReport?: () => void;
  public onAnalyzeNow?: () => void;

  resolveWebviewView(webviewView: vscode.WebviewView, _ctx: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._html();

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'ready':        this._push(); break;
        case 'openReport':   this.onOpenReport?.(); break;
        case 'analyzeNow':   this.onAnalyzeNow?.(); break;
      }
    });
  }

  public update(partial: Partial<LiveDNAState>) {
    this._state = { ...this._state, ...partial };
    this._push();
  }

  public reset() {
    this._state = {
      sessionActive: false, problemName: '', elapsedSec: 0,
      editVelocity: 0, hesitationCount: 0, rewriteCount: 0,
      waCount: 0, tleCount: 0, compilationAttempts: 0,
      styleSignals: [], tiltWarning: false, analysisReady: false, quotaRemaining: 10
    };
    this._push();
  }

  private _push() {
    this._view?.webview.postMessage({ command: 'update', state: this._state });
  }

  private _html(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-sideBar-background);
    padding: 10px;
    display: flex; flex-direction: column; gap: 10px;
    min-height: 100vh;
  }

  .empty { color: #64748b; text-align: center; padding: 32px 8px; line-height: 1.7; }

  /* Timer */
  .timer {
    text-align: center; padding: 14px 10px 10px;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
  }
  .timer-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .timer-val { font-size: 30px; font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: 2px; margin: 4px 0; }
  .timer-prob { font-size: 11px; color: #5ecfff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .timer-active { color: #4ade80; }
  .timer-idle   { color: #64748b; }

  /* Stats grid */
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .stat {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px; padding: 8px 10px; text-align: center;
  }
  .stat-val { font-size: 18px; font-weight: 700; font-family: monospace; }
  .stat-lbl { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

  /* Velocity bar */
  .velocity { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px 10px; }
  .vel-header { display: flex; justify-content: space-between; margin-bottom: 5px; }
  .vel-title { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .vel-val { font-size: 11px; font-family: monospace; font-weight: 700; color: #5ecfff; }
  .vel-bar { height: 5px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
  .vel-fill { height: 100%; background: linear-gradient(90deg, #5ecfff, #818cf8); border-radius: 4px; transition: width 0.5s ease; }

  /* Tilt warning */
  .tilt-box {
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.3);
    border-radius: 6px; padding: 10px;
    text-align: center; animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
  .tilt-title { color: #f87171; font-weight: 700; font-size: 13px; }
  .tilt-sub { color: #fca5a5; font-size: 10px; margin-top: 3px; }

  /* Style signals */
  .signals { display: flex; flex-wrap: wrap; gap: 4px; }
  .sig {
    font-size: 9px; font-family: monospace; padding: 2px 7px; border-radius: 10px;
    background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.25); color: #a78bfa;
  }
  .section-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

  /* Post-AC view */
  .ac-box {
    background: rgba(74,222,128,0.06);
    border: 1px solid rgba(74,222,128,0.25);
    border-radius: 8px; padding: 14px; text-align: center;
    display: flex; flex-direction: column; gap: 10px;
  }
  .ac-title { color: #4ade80; font-size: 16px; font-weight: 700; }
  .ac-sub { color: #86efac; font-size: 11px; line-height: 1.5; }
  .btn {
    padding: 7px; border: none; border-radius: 5px;
    cursor: pointer; font-size: 12px; font-weight: 600; font-family: var(--vscode-font-family);
    transition: opacity 0.15s; width: 100%;
  }
  .btn:hover { opacity: 0.85; }
  .btn-report { background: #5ecfff; color: #0a0e1a; }
  .btn-analyze { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }

  .quota-note { font-size: 10px; color: #64748b; text-align: center; }

  /* Divider */
  .div { height: 1px; background: var(--vscode-panel-border); }
</style>
</head>
<body>
<div id="root"></div>
<script>
  const vscode = acquireVsCodeApi();
  vscode.postMessage({ command: 'ready' });

  window.addEventListener('message', e => {
    if (e.data.command === 'update') render(e.data.state);
  });

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return pad(h)+':'+pad(m)+':'+pad(s);
    return pad(m)+':'+pad(s);
  }
  function pad(n) { return String(n).padStart(2,'0'); }
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function velColor(v) {
    if (v >= 60) return '#4ade80';
    if (v >= 20) return '#fbbf24';
    return '#64748b';
  }

  function render(s) {
    const root = document.getElementById('root');
    if (!root) return;

    if (!s.sessionActive) {
      root.innerHTML = '<div class="empty">🧬 DNA Coach is idle.<br><br>Fetch a problem via the <strong>Competitive Companion</strong> browser extension to start a tracked session.</div>';
      return;
    }

    let html = '';

    // ── Timer ──
    html += '<div class="timer">'
      + '<div class="timer-label">Session Time</div>'
      + '<div class="timer-val ' + (s.sessionActive ? 'timer-active' : 'timer-idle') + '">' + fmtTime(s.elapsedSec) + '</div>'
      + '<div class="timer-prob">' + esc(s.problemName) + '</div>'
      + '</div>';

    // ── Tilt Warning ──
    if (s.tiltWarning) {
      html += '<div class="tilt-box">'
        + '<div class="tilt-title">🔴 TILT WARNING</div>'
        + '<div class="tilt-sub">' + s.waCount + ' Wrong Answers — take a 5-min break!</div>'
        + '</div>';
    }

    // ── AC View ──
    if (s.analysisReady) {
      html += '<div class="ac-box">'
        + '<div class="ac-title">✅ All Tests Passed!</div>'
        + '<div class="ac-sub">Your DNA report is ready. It captured your full thought process for this problem.</div>'
        + '<button class="btn btn-report" onclick="vscode.postMessage({command:\'openReport\'})">🧬 Open DNA Report</button>'
        + '<div class="quota-note">' + s.quotaRemaining + ' free analyses remaining this month</div>'
        + '</div>';
    } else if (!s.analysisReady && s.compilationAttempts > 0) {
      html += '<button class="btn btn-analyze" onclick="vscode.postMessage({command:\'analyzeNow\'})">⚡ Analyze Now (manual)</button>';
    }

    // ── Stats Grid ──
    const velPct = Math.min(100, (s.editVelocity / 100) * 100);
    html += '<div class="stats">'
      + '<div class="stat"><div class="stat-val" style="color:' + (s.waCount >= 3 ? '#f87171' : '#fbbf24') + '">' + s.waCount + '</div><div class="stat-lbl">Wrong Answers</div></div>'
      + '<div class="stat"><div class="stat-val" style="color:#5ecfff">' + s.compilationAttempts + '</div><div class="stat-lbl">Compile Runs</div></div>'
      + '<div class="stat"><div class="stat-val" style="color:#a78bfa">' + s.hesitationCount + '</div><div class="stat-lbl">Hesitations</div></div>'
      + '<div class="stat"><div class="stat-val" style="color:#fbbf24">' + s.rewriteCount + '</div><div class="stat-lbl">Rewrites</div></div>'
      + '</div>';

    // ── Edit Velocity ──
    html += '<div class="velocity">'
      + '<div class="vel-header"><span class="vel-title">Edit Velocity</span><span class="vel-val" style="color:' + velColor(s.editVelocity) + '">' + s.editVelocity + ' ch/min</span></div>'
      + '<div class="vel-bar"><div class="vel-fill" style="width:' + velPct + '%;background:' + velColor(s.editVelocity) + '"></div></div>'
      + '</div>';

    // ── Style Signals ──
    if (s.styleSignals && s.styleSignals.length > 0) {
      html += '<div class="div"></div>'
        + '<div class="section-label">Detected Style</div>'
        + '<div class="signals">'
        + s.styleSignals.map(sig => '<span class="sig">' + esc(sig) + '</span>').join('')
        + '</div>';
    }

    root.innerHTML = html;
  }
</script>
</body>
</html>`;
  }
}
