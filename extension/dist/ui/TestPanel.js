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
exports.TestPanel = void 0;
const vscode = __importStar(require("vscode"));
class TestPanel {
    constructor(panel) {
        this._disposables = [];
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview();
    }
    static createOrShow() {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;
        if (TestPanel.currentPanel) {
            TestPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('mycpcTestPanel', 'myCPC Tests', column, { enableScripts: true });
        TestPanel.currentPanel = new TestPanel(panel);
    }
    updateState(problemName, state) {
        this._panel.webview.postMessage({ command: 'update', problemName, state });
    }
    dispose() {
        TestPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _getHtmlForWebview() {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>myCPC Tests</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-editor-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 10px;
                    }
                    .test-card {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        margin-bottom: 12px;
                        padding: 10px;
                        background: var(--vscode-editorWidget-background);
                    }
                    .test-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-weight: bold;
                        margin-bottom: 8px;
                    }
                    .status-passed { color: #4CAF50; }
                    .status-failed { color: #F44336; }
                    .status-running { color: #FFEB3B; }
                    .status-tle { color: #FF9800; }
                    .status-pending { color: var(--vscode-descriptionForeground); }
                    
                    pre {
                        background: var(--vscode-textCodeBlock-background);
                        padding: 8px;
                        border-radius: 4px;
                        overflow-x: auto;
                        margin: 4px 0 12px 0;
                    }
                    h4 { margin: 0 0 4px 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
                    
                    #status-bar {
                        padding: 10px;
                        margin-bottom: 15px;
                        border-radius: 6px;
                        background: var(--vscode-sideBar-background);
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <div id="status-bar">Waiting for tests...</div>
                <div id="test-container"></div>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'update') {
                            renderState(message.problemName, message.state);
                        }
                    });

                    function renderState(problemName, state) {
                        const statusDiv = document.getElementById('status-bar');
                        statusDiv.textContent = \`Problem: \${problemName} | Status: \${state.globalStatus}\`;
                        
                        if (state.globalStatus === 'Compiling...') {
                            statusDiv.style.color = '#FFEB3B';
                        } else if (state.globalStatus === 'Compilation Error') {
                            statusDiv.style.color = '#F44336';
                        } else if (state.globalStatus === 'Finished') {
                            statusDiv.style.color = '#4CAF50';
                        }

                        const container = document.getElementById('test-container');
                        container.innerHTML = '';
                        
                        if (state.compilationError) {
                            container.innerHTML = \`
                                <h4>Compilation Error</h4>
                                <pre style="color: #F44336">\${state.compilationError}</pre>
                            \`;
                            return;
                        }

                        if (!state.tests) return;

                        state.tests.forEach((test, index) => {
                            let statusClass = 'status-pending';
                            let statusText = 'Pending';
                            if (test.status === 'AC') { statusClass = 'status-passed'; statusText = 'Accepted'; }
                            else if (test.status === 'WA') { statusClass = 'status-failed'; statusText = 'Wrong Answer'; }
                            else if (test.status === 'TLE') { statusClass = 'status-tle'; statusText = 'Time Limit Exceeded'; }
                            else if (test.status === 'RE') { statusClass = 'status-failed'; statusText = 'Runtime Error'; }
                            else if (test.status === 'Running') { statusClass = 'status-running'; statusText = 'Running...'; }

                            let html = \`
                                <div class="test-card">
                                    <div class="test-header">
                                        <span>Test #\${index + 1}</span>
                                        <span class="\${statusClass}">\${statusText} \${test.time ? '('+test.time+'ms)' : ''}</span>
                                    </div>
                                    <h4>Input</h4>
                                    <pre>\${test.input}</pre>
                            \`;

                            if (test.expectedOutput) {
                                html += \`<h4>Expected Output</h4><pre>\${test.expectedOutput}</pre>\`;
                            }
                            
                            if (test.actualOutput !== undefined) {
                                html += \`<h4>Actual Output</h4><pre>\${test.actualOutput}</pre>\`;
                            }
                            
                            if (test.stderr) {
                                html += \`<h4>Standard Error</h4><pre style="color: #F44336">\${test.stderr}</pre>\`;
                            }

                            html += \`</div>\`;
                            container.innerHTML += html;
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }
}
exports.TestPanel = TestPanel;
//# sourceMappingURL=TestPanel.js.map