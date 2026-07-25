// popup/popup.js — myCPC Extension Popup Logic

'use strict';

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── On load ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkVSCodeConnection();
  await loadCurrentProblem();
  await loadHistory();
});

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get(['cfHandle', 'backendUrl', 'autoSendToVSCode', 'cfJsessionid', 'cfCsrfToken']);
  document.getElementById('cfHandle').value  = data.cfHandle  || '';
  document.getElementById('backendUrl').value = data.backendUrl || globalThis.APP_CONFIG.backendUrl;
  document.getElementById('autoSend').checked = data.autoSendToVSCode || false;
  // Don't pre-fill credentials for security
  if (data.cfHandle) {
    document.getElementById('handleText').textContent = `@${data.cfHandle}`;
  }
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const cfHandle      = document.getElementById('cfHandle').value.trim();
  const backendUrl    = document.getElementById('backendUrl').value.trim() || globalThis.APP_CONFIG.backendUrl;
  const jsessionid    = document.getElementById('cfJsessionid').value.trim();
  const csrfToken     = document.getElementById('cfCsrfToken').value.trim();
  const autoSend      = document.getElementById('autoSend').checked;

  await chrome.storage.local.set({ cfHandle, backendUrl, autoSendToVSCode: autoSend });

  if (jsessionid && csrfToken) {
    // Send to background to sync to backend
    chrome.runtime.sendMessage({ type: 'SAVE_CF_CREDS', jsessionid, csrfToken, cfHandle });
  }

  document.getElementById('handleText').textContent = cfHandle ? `@${cfHandle}` : '';
  const msg = document.getElementById('saveMsg');
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', 2000);
});

// ── VS Code Connection Check ──────────────────────────────────────────────────

async function checkVSCodeConnection() {
  const dot = document.getElementById('vscDot');
  const txt = document.getElementById('connText');
  try {
    const res = await fetch(globalThis.APP_CONFIG.listenerUrl, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
    // VS Code extension responds on 10043 — if we get a response (even 405 method not allowed), it's up
    dot.classList.add('connected');
    txt.textContent = 'VS Code: online ✓';
    txt.className = 'conn-ok';
  } catch {
    dot.classList.remove('connected');
    dot.classList.add('error');
    txt.textContent = 'VS Code: offline (press F5 in VS Code)';
    txt.className = 'conn-err';
  }
}

// ── Current Problem ───────────────────────────────────────────────────────────

async function loadCurrentProblem() {
  const data = await chrome.storage.local.get(['currentProblem', 'lastUpdated']);
  const problem = data.currentProblem;
  const area = document.getElementById('problem-area');

  if (!problem) {
    area.innerHTML = `<div class="empty"><div class="empty-icon">📋</div>Navigate to any CF, AtCoder, CSES, or CodeChef problem page and it will appear here automatically.</div>`;
    return;
  }

  // How old is the data?
  const ageMin = Math.round((Date.now() - (data.lastUpdated || 0)) / 60000);
  const ageLabel = ageMin < 1 ? 'just now' : `${ageMin}m ago`;

  const tlSec = problem.timeLimit >= 1000 ? (problem.timeLimit / 1000) + 's' : problem.timeLimit + 'ms';

  // Fetch intelligence
  const intel = await fetchIntel(problem);

  area.innerHTML = `
    <div class="problem-card">
      <div class="problem-name" title="${esc(problem.name)}">${esc(problem.name)}</div>
      <div class="problem-meta">
        <span class="meta-chip chip-judge">${esc(problem.judge || 'CF')}</span>
        <span class="meta-chip chip-tl">⏱ ${tlSec}</span>
        <span class="meta-chip chip-ml">📦 ${problem.memoryLimit}MB</span>
        <span class="meta-chip chip-tc">🧪 ${problem.tests?.length || 0} tests</span>
      </div>
      ${intel ? `
      <div class="intel-grid">
        <div class="intel-card">
          <div class="intel-val val-cf">${intel.cfDifficulty || '?'}</div>
          <div class="intel-lbl">CF Rating</div>
        </div>
        <div class="intel-card">
          <div class="intel-val val-you">${intel.yourDifficulty || '?'}</div>
          <div class="intel-lbl">For You</div>
        </div>
        <div class="intel-card">
          <div class="intel-val val-time">~${intel.predictedMinutes || '?'}m</div>
          <div class="intel-lbl">Est. Time</div>
        </div>
      </div>
      ${intel.topTags?.length ? `<div class="tags">${intel.topTags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ` : `<div style="font-size:10px;color:#64748b;margin-bottom:8px;">Set your CF handle in Settings to see personal predictions.</div>`}
      <button class="send-btn" id="sendBtn">
        <span>▶</span> Send to VS Code
      </button>
      <div style="text-align:center;font-size:10px;color:#64748b;margin-top:6px;">Last seen: ${ageLabel}</div>
    </div>
  `;

  document.getElementById('sendBtn')?.addEventListener('click', () => sendToVSCode(problem));
}

async function sendToVSCode(payload) {
  const btn = document.getElementById('sendBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>⟳</span> Sending...'; }

  const result = await chrome.runtime.sendMessage({ type: 'SEND_TO_VSCODE', payload });

  if (btn) {
    if (result?.success) {
      btn.innerHTML = '<span>✓</span> Sent to VS Code!';
      btn.classList.add('sent');
    } else {
      btn.innerHTML = '<span>✗</span> Failed — Is VS Code running?';
      btn.style.background = '#f87171';
    }
    btn.disabled = false;
  }
}

async function fetchIntel(problem) {
  try {
    const data = await chrome.storage.local.get(['cfHandle', 'backendUrl']);
    if (!data.cfHandle) return null;
    const backend = data.backendUrl || globalThis.APP_CONFIG.backendUrl;
    const res = await fetch(`${backend}/api/dna/problem-intel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cfHandle: data.cfHandle, contestId: problem.contestId, problemIndex: problem.problemIndex, timeLimit: problem.timeLimit }),
      signal: AbortSignal.timeout(3000)
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// ── History ───────────────────────────────────────────────────────────────────

async function loadHistory() {
  try {
    const data = await chrome.storage.local.get(['cfHandle', 'backendUrl']);
    if (!data.cfHandle) return;
    const backend = data.backendUrl || globalThis.APP_CONFIG.backendUrl;
    const res = await fetch(`${backend}/api/dna/history/${data.cfHandle}?limit=10`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const json = await res.json();
    if (!json.success || !json.history?.length) return;

    const area = document.getElementById('history-area');
    area.innerHTML = json.history.map(h => {
      const mins = Math.round((h.total_time_sec || 0) / 60);
      const v = h.verdict || 'AC';
      return `<div class="history-item">
        <span class="hist-verdict ${v === 'AC' ? 'hist-v-ac' : 'hist-v-wa'}">${v === 'AC' ? '✅' : '❌'}</span>
        <span class="hist-name">${esc(h.problem_name || '')}</span>
        <span class="hist-time">${mins}m</span>
      </div>`;
    }).join('');
  } catch { /* ignore */ }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
