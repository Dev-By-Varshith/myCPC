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
exports.ProblemPanel = void 0;
const vscode = __importStar(require("vscode"));
/**
 * ProblemPanel — Panel 2: Problem Statement & Metadata
 *
 * Shows:
 *  - Contest name, problem index, time/memory limits
 *  - A "View on CF" button that opens in the browser
 *  - Test case count and memory
 *  - CF auto-submit button (opens submission flow)
 *  - Setup instructions for CF cookie auth
 */
class ProblemPanel {
    constructor() {
        this._meta = null;
        this._submitStatus = '';
        this._submitVerdict = '';
    }
    resolveWebviewView(webviewView, _ctx, _token) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._html();
        webviewView.webview.onDidReceiveMessage(msg => {
            switch (msg.command) {
                case 'ready':
                    this._push();
                    break;
                case 'submit':
                    this.onSubmit?.();
                    break;
                case 'openCF': {
                    if (this._meta?.url)
                        vscode.env.openExternal(vscode.Uri.parse(this._meta.url));
                    break;
                }
                case 'openSettings': {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'mycpc');
                    break;
                }
            }
        });
    }
    setProblem(meta) {
        this._meta = meta;
        this._submitStatus = '';
        this._submitVerdict = '';
        this._push();
    }
    setSubmitStatus(status, verdict) {
        this._submitStatus = status;
        this._submitVerdict = verdict || '';
        this._push();
    }
    _push() {
        this._view?.webview.postMessage({
            command: 'update',
            meta: this._meta,
            submitStatus: this._submitStatus,
            submitVerdict: this._submitVerdict
        });
    }
    _html() {
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
    padding: 12px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .empty { color: #64748b; font-size: 12px; text-align: center; padding: 32px 8px; line-height: 1.7; }
  
  .title { font-size: 14px; font-weight: 700; line-height: 1.3; word-break: break-word; }
  .group { font-size: 11px; color: #64748b; margin-top: 2px; }

  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .meta-card {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px; padding: 8px 10px; text-align: center;
  }
  .meta-val { font-size: 15px; font-weight: 700; font-family: monospace; }
  .meta-lbl { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
  .val-tl { color: #fbbf24; }
  .val-ml { color: #5ecfff; }
  .val-tc { color: #a78bfa; }
  .val-ia { color: #fb923c; }

  .badges { display: flex; gap: 5px; flex-wrap: wrap; }
  .badge {
    padding: 2px 8px; border-radius: 12px; font-size: 10px;
    border: 1px solid; font-family: monospace;
  }
  .badge-interactive { color: #fb923c; border-color: rgba(251,146,60,0.4); background: rgba(251,146,60,0.08); }
  .badge-std { color: #5ecfff; border-color: rgba(94,207,255,0.35); background: rgba(94,207,255,0.08); }

  .divider { height: 1px; background: var(--vscode-panel-border); }

  /* Buttons */
  .btn {
    width: 100%; padding: 7px; border: none; border-radius: 5px;
    cursor: pointer; font-size: 12px; font-family: var(--vscode-font-family);
    font-weight: 600; transition: opacity 0.15s; text-align: center;
  }
  .btn:hover { opacity: 0.85; }
  .btn-cf { background: rgba(94,207,255,0.12); color: #5ecfff; border: 1px solid rgba(94,207,255,0.3); }
  .btn-submit { background: #2ea043; color: #fff; }
  .btn-settings { background: transparent; color: #64748b; border: 1px solid var(--vscode-panel-border); font-size: 11px; }

  /* Submit status */
  .submit-status {
    padding: 8px 10px; border-radius: 6px; font-size: 11px;
    border: 1px solid; font-family: monospace;
  }
  .status-ok   { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.06); }
  .status-err  { color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.06); }
  .status-info { color: #5ecfff; border-color: rgba(94,207,255,0.3); background: rgba(94,207,255,0.06); animation: blink 1s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.5} }

  /* Cookie instructions */
  .instructions {
    background: rgba(251,191,36,0.06);
    border: 1px solid rgba(251,191,36,0.2);
    border-radius: 6px; padding: 10px;
    font-size: 10px; color: #94a3b8; line-height: 1.7;
  }
  .instructions strong { color: #fbbf24; }
</style>
</head>
<body>

<div id="content"><div class="empty">No problem loaded.<br>Fetch one via <strong>Competitive Companion</strong><br>browser extension on any CF/LC/CSES page.</div></div>

<script>
  const vscode = acquireVsCodeApi();

  window.addEventListener('message', e => {
    if (e.data.command === 'update') render(e.data.meta, e.data.submitStatus, e.data.submitVerdict);
  });

  vscode.postMessage({ command: 'ready' });

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function render(meta, submitStatus, submitVerdict) {
    const el = document.getElementById('content');
    if (!el) return;

    if (!meta) {
      el.innerHTML = '<div class="empty">No problem loaded.<br>Fetch one via <strong>Competitive Companion</strong><br>browser extension on any CF/LC/CSES page.</div>';
      return;
    }

    const isInteractive = meta.interactive;
    const tlSec = meta.timeLimit >= 1000 ? (meta.timeLimit/1000)+'s' : meta.timeLimit+'ms';
    const mlMB  = meta.memoryLimit + 'MB';

    // Verdict color
    const verdictColor = submitVerdict === 'Accepted' ? '#4ade80'
                        : submitVerdict.includes('error') || submitVerdict.includes('wrong') ? '#f87171'
                        : '#fbbf24';

    const statusClass = submitVerdict === 'Accepted' ? 'status-ok'
                       : (submitVerdict.includes('error') || submitVerdict.includes('Wrong')) ? 'status-err'
                       : 'status-info';

    el.innerHTML =
      '<div class="title">' + esc(meta.name) + '</div>'
      + '<div class="group">' + esc(meta.group || '') + '</div>'

      + '<div class="meta-grid">'
        + '<div class="meta-card"><div class="meta-val val-tl">' + esc(tlSec) + '</div><div class="meta-lbl">Time Limit</div></div>'
        + '<div class="meta-card"><div class="meta-val val-ml">' + esc(mlMB) + '</div><div class="meta-lbl">Memory</div></div>'
        + '<div class="meta-card"><div class="meta-val val-tc">' + (meta.tests?.length || 0) + '</div><div class="meta-lbl">Sample Tests</div></div>'
        + '<div class="meta-card"><div class="meta-val val-ia">' + (isInteractive ? 'Yes' : 'No') + '</div><div class="meta-lbl">Interactive</div></div>'
      + '</div>'

      + '<div class="badges">'
        + (isInteractive ? '<span class="badge badge-interactive">⚡ Interactive</span>' : '<span class="badge badge-std">Standard I/O</span>')
        + (meta.problemIndex ? '<span class="badge badge-std">' + esc(meta.problemIndex) + '</span>' : '')
      + '</div>'

      + '<div class="divider"></div>'

      + '<button class="btn btn-cf" onclick="vscode.postMessage({command:\'openCF\'})">🌐 Open on Codeforces</button>'

      + (meta.contestId
        ? '<button class="btn btn-submit" onclick="vscode.postMessage({command:\'submit\'})">☁ Submit to Codeforces</button>'
        : '')

      + (submitStatus
        ? '<div class="submit-status ' + statusClass + '">'
          + (submitVerdict ? '<strong style="color:' + esc(verdictColor) + '">' + esc(submitVerdict) + '</strong> — ' : '')
          + esc(submitStatus) + '</div>'
        : '')

      + '<div class="divider"></div>'
      + '<div class="instructions">'
        + '<strong>CF Submit Setup:</strong><br>'
        + '1. Log into codeforces.com<br>'
        + '2. F12 → Application → Cookies → copy <code>JSESSIONID</code><br>'
        + '3. F12 → Network → any request → copy <code>X-Csrf-Token</code> header<br>'
        + '4. Paste into myCPC Settings (⚙ below)'
      + '</div>'

      + '<button class="btn btn-settings" onclick="vscode.postMessage({command:\'openSettings\'})">⚙ Open myCPC Settings</button>';
  }
</script>
</body>
</html>`;
    }
}
exports.ProblemPanel = ProblemPanel;
ProblemPanel.viewType = 'mycpc.problemView';
//# sourceMappingURL=ProblemPanel.js.map