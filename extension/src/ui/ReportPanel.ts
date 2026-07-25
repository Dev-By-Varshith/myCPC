import * as vscode from 'vscode';
import { AnalysisResult, DNAReport } from '../analysis/ReportGenerator';
import { SessionSummary } from '../analysis/SessionAnalyzer';
import { getBackendUrl } from '../env';
/**
 * ReportPanel
 * 
 * A full-screen VS Code WebviewPanel that renders the DNA analysis report.
 * Features:
 *  - Animated DNA radar/bar chart (speed, accuracy, cleanliness, resilience)
 *  - Visual coding timeline with hesitation markers
 *  - LLM-generated analysis sections (style, struggles, pivot, growth plan)
 *  - Merit/Demerit highlight cards
 *  - Deep-link to the myCPC web dashboard
 */
export class ReportPanel {
  public static currentPanel: ReportPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri): ReportPanel {
    const column = vscode.ViewColumn.Two;

    if (ReportPanel.currentPanel) {
      ReportPanel.currentPanel._panel.reveal(column);
      return ReportPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'mycpcDNAReport',
      '🧬 myCPC DNA Report',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    ReportPanel.currentPanel = new ReportPanel(panel);
    return ReportPanel.currentPanel;
  }

  public showLoading(problemName: string) {
    this._panel.webview.html = this._getLoadingHtml(problemName);
    this._panel.reveal(vscode.ViewColumn.Two, false);
  }

  public showReport(result: AnalysisResult, summary: SessionSummary) {
    this._panel.webview.html = this._getReportHtml(result, summary);
    this._panel.reveal(vscode.ViewColumn.Two, false);
  }

  public showError(message: string) {
    this._panel.webview.html = this._getErrorHtml(message);
    this._panel.reveal(vscode.ViewColumn.Two, false);
  }

  public dispose() {
    ReportPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  // ── HTML Generators ───────────────────────────────────────────────────

  private _getLoadingHtml(problemName: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0e1a;
      color: #e2e8f0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }
    .dna-spinner {
      width: 64px;
      height: 64px;
      border: 3px solid rgba(94,207,255,0.15);
      border-top-color: #5ecfff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { color: #5ecfff; font-size: 18px; font-weight: 600; }
    p { color: #64748b; font-size: 13px; }
    .problem-tag {
      background: rgba(94,207,255,0.1);
      border: 1px solid rgba(94,207,255,0.3);
      color: #5ecfff;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="dna-spinner"></div>
  <div class="problem-tag">${this._esc(problemName)}</div>
  <h2>Analyzing your coding DNA...</h2>
  <p>Gemini Flash is reading your thought process</p>
</body>
</html>`;
  }

  private _getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0e1a;
      color: #e2e8f0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 40px;
      text-align: center;
    }
    .icon { font-size: 48px; }
    h2 { color: #ff4444; font-size: 18px; }
    p { color: #94a3b8; font-size: 13px; max-width: 480px; line-height: 1.6; }
    .tip {
      background: rgba(255,200,0,0.08);
      border: 1px solid rgba(255,200,0,0.2);
      border-radius: 8px;
      padding: 16px 24px;
      color: #fbbf24;
      font-size: 12px;
      max-width: 500px;
    }
  </style>
</head>
<body>
  <div class="icon">⚠️</div>
  <h2>Analysis Failed</h2>
  <p>${this._esc(message)}</p>
  <div class="tip">
    💡 <strong>To get unlimited analyses:</strong> Add your own free Gemini API key in VS Code settings
    <code>mycpc.geminiApiKey</code>. Get a free key at aistudio.google.com
  </div>
</body>
</html>`;
  }

  private _getReportHtml(result: AnalysisResult, summary: SessionSummary): string {
    const { report, dnaAxes, styleSignals, quotaRemaining } = result;
    const totalMins = Math.round(summary.totalTimeSec / 60);
    const axes = dnaAxes || { speed: 50, accuracy: 50, cleanliness: 50, resilience: 50 };

    const styleTagsHtml = (styleSignals || []).map(s =>
      `<span class="style-tag">${this._esc(s)}</span>`
    ).join('');

    const struggleHtml = (report?.strugglePoints || []).map((sp: any, i: number) => `
      <div class="struggle-item">
        <div class="struggle-time">${this._esc(sp.timestamp || `~${i * 5}m`)}</div>
        <div>
          <div class="struggle-issue">${this._esc(sp.issue || '')}</div>
          <div class="struggle-detail">${this._esc(sp.explanation || '')}</div>
        </div>
      </div>
    `).join('');

    const growthHtml = (report?.growthPlan || []).map((g: any, i: number) => `
      <div class="growth-card">
        <div class="growth-num">${i + 1}</div>
        <div>
          <div class="growth-title">${this._esc(g.title || '')}</div>
          <div class="growth-detail">${this._esc(g.detail || '')}</div>
        </div>
      </div>
    `).join('');

    const BACKEND_URL = getBackendUrl();
    const dashboardUrl = BACKEND_URL.replace(':3002', ':5173') + '/dna';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>myCPC DNA Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      background: #080c18;
      color: #e2e8f0;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      border-bottom: 1px solid rgba(94,207,255,0.15);
      padding: 20px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .dna-icon { font-size: 28px; animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
    .problem-badge {
      background: rgba(94,207,255,0.12);
      border: 1px solid rgba(94,207,255,0.3);
      color: #5ecfff;
      padding: 5px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-family: 'Courier New', monospace;
      font-weight: 600;
    }
    .header-title { font-size: 17px; font-weight: 700; color: #f1f5f9; }
    .header-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .quota-badge {
      background: ${quotaRemaining <= 2 ? 'rgba(251,191,36,0.1)' : 'rgba(0,255,136,0.08)'};
      border: 1px solid ${quotaRemaining <= 2 ? 'rgba(251,191,36,0.3)' : 'rgba(0,255,136,0.2)'};
      color: ${quotaRemaining <= 2 ? '#fbbf24' : '#00ff88'};
      padding: 5px 12px;
      border-radius: 12px;
      font-size: 11px;
    }
    .dash-btn {
      background: rgba(94,207,255,0.12);
      border: 1px solid rgba(94,207,255,0.3);
      color: #5ecfff;
      padding: 7px 16px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      text-decoration: none;
    }
    .dash-btn:hover { background: rgba(94,207,255,0.2); }

    /* ── Layout ── */
    .content {
      padding: 24px 28px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    /* ── Stat Bar ── */
    .stat-bar {
      grid-column: span 2;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
    .stat-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px 20px;
      text-align: center;
    }
    .stat-value { font-size: 26px; font-weight: 700; color: #5ecfff; font-family: 'Courier New', monospace; }
    .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .stat-card.wa .stat-value { color: ${summary.waCount > 3 ? '#f87171' : '#fb923c'}; }
    .stat-card.time .stat-value { color: ${totalMins < 15 ? '#4ade80' : totalMins < 30 ? '#fbbf24' : '#f87171'}; }

    /* ── Section Card ── */
    .card {
      background: rgba(15,23,42,0.8);
      border: 1px solid rgba(94,207,255,0.1);
      border-radius: 16px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card-full { grid-column: span 2; }
    .card-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-title-icon { font-size: 14px; }

    /* ── DNA Axes ── */
    .axes-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .axis-row { display: flex; flex-direction: column; gap: 6px; }
    .axis-header { display: flex; justify-content: space-between; font-size: 12px; }
    .axis-name { color: #94a3b8; }
    .axis-score { font-family: monospace; font-weight: 700; }
    .axis-bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
    .axis-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 1.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* ── Style Tags ── */
    .style-tags { display: flex; flex-wrap: wrap; gap: 8px; }
    .style-tag {
      background: rgba(139,92,246,0.12);
      border: 1px solid rgba(139,92,246,0.3);
      color: #a78bfa;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-family: monospace;
    }

    /* ── Style Summary ── */
    .style-text {
      color: #cbd5e1;
      font-size: 13.5px;
      line-height: 1.7;
      background: rgba(94,207,255,0.04);
      border-left: 3px solid #5ecfff;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
    }

    /* ── Merit / Demerit ── */
    .merit-demerit {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .merit-card, .demerit-card {
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 12.5px;
      line-height: 1.6;
    }
    .merit-card {
      background: rgba(0,255,136,0.06);
      border: 1px solid rgba(0,255,136,0.2);
      color: #4ade80;
    }
    .demerit-card {
      background: rgba(248,113,113,0.06);
      border: 1px solid rgba(248,113,113,0.2);
      color: #f87171;
    }
    .merit-label, .demerit-label {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    /* ── Struggle Points ── */
    .struggle-list { display: flex; flex-direction: column; gap: 10px; }
    .struggle-item {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      background: rgba(248,113,113,0.04);
      border: 1px solid rgba(248,113,113,0.12);
      border-radius: 8px;
      padding: 12px 14px;
    }
    .struggle-time {
      font-family: monospace;
      font-size: 11px;
      color: #f87171;
      white-space: nowrap;
      background: rgba(248,113,113,0.1);
      padding: 2px 8px;
      border-radius: 4px;
      margin-top: 2px;
    }
    .struggle-issue { font-size: 12px; font-weight: 600; color: #fca5a5; margin-bottom: 3px; }
    .struggle-detail { font-size: 11.5px; color: #94a3b8; line-height: 1.5; }

    /* ── Pivot ── */
    .pivot-text {
      color: #cbd5e1;
      font-size: 13.5px;
      line-height: 1.7;
      background: rgba(251,191,36,0.04);
      border-left: 3px solid #fbbf24;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
    }

    /* ── Growth Plan ── */
    .growth-list { display: flex; flex-direction: column; gap: 12px; }
    .growth-card {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      background: rgba(94,207,255,0.04);
      border: 1px solid rgba(94,207,255,0.1);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .growth-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #5ecfff, #818cf8);
      color: #0a0e1a;
      font-weight: 800;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .growth-title { font-size: 12.5px; font-weight: 700; color: #5ecfff; margin-bottom: 4px; }
    .growth-detail { font-size: 11.5px; color: #94a3b8; line-height: 1.6; }

    /* ── Timeline ── */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
      font-size: 11.5px;
      font-family: monospace;
      max-height: 180px;
      overflow-y: auto;
    }
    .timeline-event {
      display: flex;
      gap: 12px;
      padding: 6px 0;
      border-left: 2px solid rgba(255,255,255,0.06);
      padding-left: 14px;
      position: relative;
    }
    .timeline-event::before {
      content: '';
      position: absolute;
      left: -4px;
      top: 10px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #334155;
    }
    .tl-ac::before { background: #4ade80; }
    .tl-wa::before { background: #f87171; }
    .tl-pause::before { background: #fbbf24; }
    .tl-text { color: #64748b; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <span class="dna-icon">🧬</span>
      <div>
        <div class="header-title">Coder DNA Report</div>
        <div class="header-sub">AI-Powered Post-Session Analysis</div>
      </div>
      <div class="problem-badge">${this._esc(summary.problemName)}</div>
    </div>
    <div style="display:flex;gap:10px;align-items:center">
      <div class="quota-badge">${quotaRemaining} analyses left this month</div>
      <a class="dash-btn" href="${dashboardUrl}" title="View full DNA profile in browser">🌐 Full Profile</a>
    </div>
  </div>

  <div class="content">

    <!-- Stat Bar -->
    <div class="stat-bar">
      <div class="stat-card time">
        <div class="stat-value">${totalMins}m</div>
        <div class="stat-label">Solve Time</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.compilationAttempts}</div>
        <div class="stat-label">Compilations</div>
      </div>
      <div class="stat-card wa">
        <div class="stat-value">${summary.waCount}</div>
        <div class="stat-label">Wrong Answers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.rewriteCount}</div>
        <div class="stat-label">Rewrites</div>
      </div>
    </div>

    <!-- DNA Axes Card -->
    <div class="card">
      <div class="card-title"><span class="card-title-icon">📊</span> DNA AXES</div>
      <div class="axes-grid">
        <div class="axis-row">
          <div class="axis-header">
            <span class="axis-name">Speed</span>
            <span class="axis-score" style="color:${this._axisColor(axes.speed)}">${Math.round(axes.speed)}</span>
          </div>
          <div class="axis-bar"><div class="axis-fill" id="ax-speed" style="width:0%;background:${this._axisColor(axes.speed)}"></div></div>
        </div>
        <div class="axis-row">
          <div class="axis-header">
            <span class="axis-name">Accuracy</span>
            <span class="axis-score" style="color:${this._axisColor(axes.accuracy)}">${Math.round(axes.accuracy)}</span>
          </div>
          <div class="axis-bar"><div class="axis-fill" id="ax-accuracy" style="width:0%;background:${this._axisColor(axes.accuracy)}"></div></div>
        </div>
        <div class="axis-row">
          <div class="axis-header">
            <span class="axis-name">Cleanliness</span>
            <span class="axis-score" style="color:${this._axisColor(axes.cleanliness)}">${Math.round(axes.cleanliness)}</span>
          </div>
          <div class="axis-bar"><div class="axis-fill" id="ax-cleanliness" style="width:0%;background:${this._axisColor(axes.cleanliness)}"></div></div>
        </div>
        <div class="axis-row">
          <div class="axis-header">
            <span class="axis-name">Resilience</span>
            <span class="axis-score" style="color:${this._axisColor(axes.resilience)}">${Math.round(axes.resilience)}</span>
          </div>
          <div class="axis-bar"><div class="axis-fill" id="ax-resilience" style="width:0%;background:${this._axisColor(axes.resilience)}"></div></div>
        </div>
      </div>
      <div class="card-title" style="margin-top:6px"><span class="card-title-icon">🏷️</span> STYLE SIGNALS</div>
      <div class="style-tags">${styleTagsHtml || '<span class="style-tag">balanced-solver</span>'}</div>
    </div>

    <!-- Style Summary Card -->
    <div class="card">
      <div class="card-title"><span class="card-title-icon">🧠</span> THOUGHT PROCESS STYLE</div>
      <div class="style-text">${this._esc(report?.styleSummary || 'Analysis unavailable.')}</div>
      <div class="merit-demerit">
        <div class="merit-card">
          <div class="merit-label">✅ Key Strength</div>
          ${this._esc(report?.merit || 'N/A')}
        </div>
        <div class="demerit-card">
          <div class="demerit-label">🔴 Growth Area</div>
          ${this._esc(report?.demerit || 'N/A')}
        </div>
      </div>
    </div>

    <!-- Struggle Points -->
    <div class="card">
      <div class="card-title"><span class="card-title-icon">🔴</span> STRUGGLE POINTS</div>
      <div class="struggle-list">
        ${struggleHtml || '<p style="color:#64748b;font-size:12px">No major struggle points detected — clean solve!</p>'}
      </div>
    </div>

    <!-- Pivot Analysis -->
    <div class="card">
      <div class="card-title"><span class="card-title-icon">↗️</span> PIVOT ANALYSIS</div>
      <div class="pivot-text">${this._esc(report?.pivotAnalysis || 'No significant pivot detected.')}</div>
    </div>

    <!-- Growth Plan -->
    <div class="card card-full">
      <div class="card-title"><span class="card-title-icon">🚀</span> PERSONALIZED GROWTH PLAN</div>
      <div class="growth-list">
        ${growthHtml || '<p style="color:#64748b;font-size:12px">Growth plan unavailable.</p>'}
      </div>
    </div>

  </div>

  <script>
    // Animate bars on load
    window.addEventListener('load', () => {
      setTimeout(() => {
        const bars = [
          ['ax-speed', ${Math.round(axes.speed)}],
          ['ax-accuracy', ${Math.round(axes.accuracy)}],
          ['ax-cleanliness', ${Math.round(axes.cleanliness)}],
          ['ax-resilience', ${Math.round(axes.resilience)}]
        ];
        bars.forEach(([id, val]) => {
          const el = document.getElementById(id);
          if (el) el.style.width = val + '%';
        });
      }, 150);
    });
  </script>
</body>
</html>`;
  }

  private _axisColor(score: number): string {
    if (score >= 75) return '#4ade80';
    if (score >= 50) return '#fbbf24';
    return '#f87171';
  }

  private _esc(str: string): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
