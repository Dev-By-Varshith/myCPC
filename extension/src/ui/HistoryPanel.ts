import * as vscode from 'vscode';

export interface HistoryEntry {
  sessionId: number;
  problemName: string;
  date: string;        // ISO
  totalTimeSec: number;
  waCount: number;
  status: 'solved' | 'timeout' | 'analyzing';
  dnaAxes?: { speed: number; accuracy: number; cleanliness: number; resilience: number };
  styleSignals?: string[];
}

/**
 * HistoryPanel — Panel 4: Session History
 *
 * Shows the last N analyzed sessions with mini DNA bar charts.
 * Clicking a session fires onOpenSession so extension.ts can
 * open the full ReportPanel for that session.
 */
export class HistoryPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mycpc.historyView';
  private _view?: vscode.WebviewView;
  private _history: HistoryEntry[] = [];
  private _loading = false;
  private _cfHandle = '';

  public onOpenSession?: (sessionId: number) => void;
  public onRefresh?: () => void;

  resolveWebviewView(webviewView: vscode.WebviewView, _ctx: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._html();

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'ready':        this._push(); break;
        case 'openSession':  this.onOpenSession?.(msg.sessionId); break;
        case 'refresh':      this.onRefresh?.(); break;
      }
    });
  }

  public setHistory(entries: HistoryEntry[], cfHandle: string) {
    this._history = entries;
    this._cfHandle = cfHandle;
    this._loading = false;
    this._push();
  }

  public setLoading(v: boolean) {
    this._loading = v;
    this._push();
  }

  private _push() {
    this._view?.webview.postMessage({ command: 'update', history: this._history, loading: this._loading, cfHandle: this._cfHandle });
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
    padding-bottom: 20px;
  }

  /* Header */
  .hdr {
    position: sticky; top: 0; z-index: 5;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 8px 10px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .hdr-title { font-weight: 700; font-size: 12px; }
  .hdr-handle { font-size: 10px; color: #5ecfff; font-family: monospace; }
  .refresh-btn {
    background: none; border: none; color: #64748b; cursor: pointer;
    font-size: 13px; padding: 2px 5px; border-radius: 3px;
  }
  .refresh-btn:hover { color: #5ecfff; }

  .empty { color: #64748b; text-align: center; padding: 32px 12px; line-height: 1.8; font-size: 11px; }
  .loading { color: #64748b; text-align: center; padding: 20px; font-size: 11px; }

  /* Session list */
  .list { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .entry {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px; padding: 10px;
    cursor: pointer; transition: border-color 0.15s;
  }
  .entry:hover { border-color: rgba(94,207,255,0.4); }

  .entry-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .entry-name { font-family: monospace; font-size: 11.5px; font-weight: 700; color: #5ecfff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .entry-status { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 4px; flex-shrink: 0; margin-left: 6px; }
  .s-solved { color: #4ade80; background: rgba(74,222,128,0.1); }
  .s-timeout { color: #f87171; background: rgba(248,113,113,0.1); }
  .s-analyzing { color: #fbbf24; background: rgba(251,191,36,0.1); }

  .entry-meta { display: flex; gap: 10px; font-size: 10px; color: #64748b; margin-bottom: 6px; }

  /* Mini DNA bars */
  .dna-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .bar-row { display: flex; align-items: center; gap: 5px; }
  .bar-name { font-size: 9px; color: #64748b; width: 55px; flex-shrink: 0; }
  .bar-track { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 2px; }
  .bar-val { font-size: 9px; font-family: monospace; width: 22px; text-align: right; flex-shrink: 0; }

  /* Style signals */
  .sigs { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px; }
  .sig {
    font-size: 9px; font-family: monospace; padding: 1px 6px; border-radius: 10px;
    background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2); color: #a78bfa;
  }
</style>
</head>
<body>

<div class="hdr">
  <div>
    <div class="hdr-title">Session History</div>
    <div class="hdr-handle" id="handle"></div>
  </div>
  <button class="refresh-btn" onclick="vscode.postMessage({command:'refresh'})" title="Refresh from server">↻</button>
</div>

<div id="body"></div>

<script>
  const vscode = acquireVsCodeApi();
  vscode.postMessage({ command: 'ready' });

  window.addEventListener('message', e => {
    if (e.data.command === 'update') render(e.data);
  });

  function fmtTime(sec) {
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.round(sec/60) + 'm';
    return Math.floor(sec/3600) + 'h ' + Math.round((sec%3600)/60) + 'm';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
    } catch { return ''; }
  }

  function axisColor(v) {
    return v >= 75 ? '#4ade80' : v >= 50 ? '#fbbf24' : '#f87171';
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function render({ history, loading, cfHandle }) {
    const hdl = document.getElementById('handle');
    if (hdl) hdl.textContent = cfHandle || 'Set cfHandle in settings';

    const body = document.getElementById('body');
    if (!body) return;

    if (loading) { body.innerHTML = '<div class="loading">Loading sessions...</div>'; return; }

    if (!history || history.length === 0) {
      body.innerHTML = '<div class="empty">No sessions analyzed yet.<br><br>Solve a problem in VS Code → your DNA sessions will appear here automatically.</div>';
      return;
    }

    let html = '<div class="list">';
    history.forEach(entry => {
      const axes = entry.dnaAxes || {};
      const statusClass = entry.status === 'solved' ? 's-solved' : entry.status === 'timeout' ? 's-timeout' : 's-analyzing';
      const statusText = entry.status === 'solved' ? '✓ AC' : entry.status === 'timeout' ? 'Timeout' : '⟳ Analyzing';

      html += '<div class="entry" onclick="vscode.postMessage({command:\'openSession\', sessionId:' + entry.sessionId + '})">'
        + '<div class="entry-top">'
        + '<div class="entry-name">' + esc(entry.problemName) + '</div>'
        + '<div class="entry-status ' + statusClass + '">' + statusText + '</div>'
        + '</div>'
        + '<div class="entry-meta">'
        + '<span>⏱ ' + fmtTime(entry.totalTimeSec || 0) + '</span>'
        + (entry.waCount > 0 ? '<span style="color:#f87171">✗ ' + entry.waCount + ' WA</span>' : '')
        + '<span>' + fmtDate(entry.date) + '</span>'
        + '</div>';

      // Mini DNA axes bars
      if (axes.speed !== undefined) {
        html += '<div class="dna-bars">'
          + miniBar('Speed', axes.speed)
          + miniBar('Accuracy', axes.accuracy)
          + miniBar('Clean', axes.cleanliness)
          + miniBar('Resilience', axes.resilience)
          + '</div>';
      }

      // Style signals
      if (entry.styleSignals && entry.styleSignals.length > 0) {
        html += '<div class="sigs">' + entry.styleSignals.slice(0,3).map(s => '<span class="sig">' + esc(s) + '</span>').join('') + '</div>';
      }

      html += '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  function miniBar(name, val) {
    if (val === undefined || val === null) return '';
    const color = val >= 75 ? '#4ade80' : val >= 50 ? '#fbbf24' : '#f87171';
    return '<div class="bar-row">'
      + '<div class="bar-name">' + name + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(val) + '%;background:' + color + '"></div></div>'
      + '<div class="bar-val" style="color:' + color + '">' + Math.round(val) + '</div>'
      + '</div>';
  }
</script>
</body>
</html>`;
  }
}
