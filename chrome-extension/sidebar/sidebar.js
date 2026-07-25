// sidebar/sidebar.js — myCPC Problem Intelligence Sidebar
// Receives PROBLEM_PARSED + CONTEST_UPDATE messages from background/content scripts

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let currentProblem = null;
let currentIntel   = null;
let tagMode        = 'hide'; // 'show' | 'hide' | 'hint'
let contestData    = null;
let contestTimerInterval = null;
let backendUrl     = globalThis.APP_CONFIG.backendUrl;
let cfHandle       = '';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load stored settings
  const stored = await chrome.storage.local.get(['cfHandle', 'backendUrl', 'tagVisibility', 'currentProblem', 'contestStatus']);
  cfHandle   = stored.cfHandle  || '';
  backendUrl = stored.backendUrl || globalThis.APP_CONFIG.backendUrl;
  tagMode    = stored.tagVisibility || 'hide';

  // Restore tag toggle UI
  updateTagToggleUI();

  // Render stored problem immediately (if any)
  if (stored.currentProblem) {
    currentProblem = stored.currentProblem;
    showProblem(currentProblem);
    fetchAndRenderIntel(currentProblem);
  }

  // Render stored contest status
  if (stored.contestStatus?.isLive) {
    renderContestPanel(stored.contestStatus);
  }

  // Check VS Code connection
  checkVSCodeStatus();

  // Check DNA profile for bar
  if (cfHandle) fetchDNABar();
});

// ── Message Listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'SIDEBAR_UPDATE':
    case 'PROBLEM_PARSED':
      currentProblem = msg.payload;
      showProblem(currentProblem);
      fetchAndRenderIntel(currentProblem);
      break;

    case 'CONTEST_UPDATE':
      if (msg.status?.isLive) renderContestPanel(msg.status);
      break;

    case 'SIDEBAR_REFRESH':
      chrome.storage.local.get(['currentProblem', 'contestStatus'], (data) => {
        if (data.currentProblem) {
          currentProblem = data.currentProblem;
          showProblem(currentProblem);
          fetchAndRenderIntel(currentProblem);
        }
        if (data.contestStatus?.isLive) renderContestPanel(data.contestStatus);
      });
      break;
  }
});

// ── Show Problem Panel ────────────────────────────────────────────────────────
function showProblem(payload) {
  document.getElementById('no-problem').style.display = 'none';
  document.getElementById('intel-panel').style.display = 'block';

  document.getElementById('problem-name').textContent = payload.name || 'Unknown Problem';
  document.getElementById('problem-group').textContent = payload.group || 'Problem';

  const tlSec = payload.timeLimit >= 1000 ? (payload.timeLimit / 1000) + 's' : payload.timeLimit + 'ms';
  document.getElementById('problem-meta').innerHTML = `
    <span class="meta-chip chip-judge">${esc(payload.judge || 'CF')}</span>
    <span class="meta-chip chip-tl">⏱ ${tlSec}</span>
    <span class="meta-chip chip-ml">📦 ${payload.memoryLimit || 256}MB</span>
    ${payload.tests?.length ? `<span class="meta-chip chip-tc">🧪 ${payload.tests.length} tests</span>` : ''}
  `;

  // Reset intel cards to loading
  document.getElementById('cf-diff').textContent    = '...';
  document.getElementById('your-diff').textContent  = '...';
  document.getElementById('pred-time').textContent  = '...';
  document.getElementById('gm-bench').style.display = 'none';

  // Reset tag area
  renderTags([]);
}

// ── Fetch Intel from Backend ──────────────────────────────────────────────────
async function fetchAndRenderIntel(payload) {
  if (!cfHandle) {
    document.getElementById('cf-diff').textContent   = '?';
    document.getElementById('your-diff').textContent = '?';
    document.getElementById('pred-time').textContent = '?';
    return;
  }

  try {
    const res = await fetch(`${backendUrl}/api/dna/problem-intel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cfHandle,
        contestId:    payload.contestId,
        problemIndex: payload.problemIndex,
        timeLimit:    payload.timeLimit,
        judge:        payload.judge
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) throw new Error('Backend error');
    const intel = await res.json();
    currentIntel = intel;

    document.getElementById('statusDot').className = 'status-dot online';
    renderIntelCards(intel);
    renderTags(intel.topTags || []);
    renderSimilarProblems(intel.solvedSimilar || []);
    renderFillGap(intel.fillGapProblems || []);

    if (intel.gmBenchmarkMinutes) {
      document.getElementById('gm-text').textContent = `GM benchmarks this in ~${intel.gmBenchmarkMinutes}m`;
      document.getElementById('gm-bench').style.display = 'flex';
    }

  } catch (e) {
    document.getElementById('statusDot').className = 'status-dot error';
    document.getElementById('cf-diff').textContent   = '?';
    document.getElementById('your-diff').textContent = '?';
    document.getElementById('pred-time').textContent = '?';
    // Try to at least show tags from the page if no backend
  }
}

function renderIntelCards(intel) {
  document.getElementById('cf-diff').textContent   = intel.cfDifficulty   || '?';
  document.getElementById('your-diff').textContent = intel.yourDifficulty || '?';
  document.getElementById('pred-time').textContent = intel.predictedMinutes ? `~${intel.predictedMinutes}m` : '?';
}

// ── Tag Advisor ───────────────────────────────────────────────────────────────
function renderTags(tags) {
  const container = document.getElementById('tags-container');
  const hiddenMsg = document.getElementById('tag-hidden-msg');

  if (!tags || tags.length === 0) {
    container.style.display = 'none';
    hiddenMsg.style.display = 'block';
    hiddenMsg.textContent = 'No tags found for this problem.';
    return;
  }

  switch (tagMode) {
    case 'hide':
      container.style.display = 'none';
      hiddenMsg.style.display = 'block';
      hiddenMsg.textContent = `Tags hidden. Use "Hint" for 1 tag or "Show" to reveal all.`;
      break;

    case 'hint':
      container.style.display = 'flex';
      hiddenMsg.style.display = 'none';
      // Show first tag revealed, rest blurred
      container.innerHTML = tags.map((t, i) =>
        `<span class="tag ${i > 0 ? 'blurred' : ''}">${i === 0 ? esc(t) : esc(t)}</span>`
      ).join('');
      break;

    case 'show':
      container.style.display = 'flex';
      hiddenMsg.style.display = 'none';
      container.innerHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
      break;
  }
}

// Tag toggle button logic
document.getElementById('tagToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-btn');
  if (!btn) return;
  tagMode = btn.dataset.mode;
  chrome.storage.local.set({ tagVisibility: tagMode });
  updateTagToggleUI();
  renderTags(currentIntel?.topTags || []);
});

function updateTagToggleUI() {
  document.querySelectorAll('.tag-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === tagMode);
  });
}

// ── Similar Problems ──────────────────────────────────────────────────────────
function renderSimilarProblems(problems) {
  const section = document.getElementById('similar-section');
  const list    = document.getElementById('similar-list');
  if (!problems || problems.length === 0) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  list.innerHTML = problems.slice(0, 4).map(p => `
    <a href="${esc(p.url)}" target="_blank" class="prob-item">
      <span class="prob-name">${esc(p.name)}</span>
      ${p.rating ? `<span class="prob-rating">${p.rating}</span>` : ''}
    </a>
  `).join('');
}

function renderFillGap(problems) {
  const section = document.getElementById('fillgap-section');
  const list    = document.getElementById('fillgap-list');
  if (!problems || problems.length === 0) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  list.innerHTML = problems.slice(0, 4).map(p => `
    <a href="${esc(p.url)}" target="_blank" class="prob-item">
      <span class="prob-name">${esc(p.name)}</span>
      ${p.rating ? `<span class="prob-rating">${p.rating}</span>` : ''}
    </a>
  `).join('');
}

// ── Send to VS Code ───────────────────────────────────────────────────────────
document.getElementById('sendBtn').addEventListener('click', async () => {
  if (!currentProblem) return;
  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';

  // Enrich payload with intel
  const enrichedPayload = {
    ...currentProblem,
    personalDifficulty: currentIntel?.yourDifficulty,
    predictedMinutes:   currentIntel?.predictedMinutes,
    topTags:            currentIntel?.topTags || [],
    solvedSimilar:      currentIntel?.solvedSimilar || [],
  };

  const result = await chrome.runtime.sendMessage({ type: 'SEND_TO_VSCODE', payload: enrichedPayload });

  if (result?.success) {
    btn.innerHTML = '<span>✓</span> Sent to VS Code!';
    btn.classList.add('sent');
    document.getElementById('vscode-status').textContent = 'DNA tracking started ✓';
  } else {
    btn.innerHTML = '<span>✗</span> Failed — VS Code offline?';
    btn.style.background = 'linear-gradient(90deg,#f87171,#ef4444)';
    document.getElementById('vscode-status').textContent = 'Press F5 in VS Code to start the extension';
  }
  btn.disabled = false;
  setTimeout(() => {
    btn.className = 'send-btn';
    btn.innerHTML = '<span>▶</span> Send to VS Code';
    btn.style.background = '';
    document.getElementById('vscode-status').textContent = '';
  }, 3000);
});

// ── Contest Sidekick Panel ────────────────────────────────────────────────────
function renderContestPanel(data) {
  contestData = data;
  const panel = document.getElementById('contest-panel');
  panel.style.display = 'block';

  if (data.endTime) startContestTimer(data.endTime);
  if (data.problems) renderContestProblems(data.problems);
}

function startContestTimer(endTimeMs) {
  if (contestTimerInterval) clearInterval(contestTimerInterval);

  function tick() {
    const remaining = endTimeMs - Date.now();
    const el = document.getElementById('contest-timer');
    if (!el) return;
    if (remaining <= 0) {
      el.textContent = '00:00:00';
      el.style.color = '#f87171';
      clearInterval(contestTimerInterval);
      return;
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    el.style.color = remaining < 900000 ? '#f87171' : remaining < 1800000 ? '#fbbf24' : '#4ade80';
  }
  tick();
  contestTimerInterval = setInterval(tick, 1000);
}

function renderContestProblems(problems) {
  const container = document.getElementById('contest-problems');
  container.innerHTML = problems.map(p => {
    const icon = p.solved ? '✅' : p.attempted ? '🔴' : '⬜';
    const time = p.solvedAt ? `${Math.floor(p.solvedAt/60000)}m` : p.attempted ? `${p.timeSpent}m` : '';
    return `<div class="contest-prob">
      <span class="cp-icon">${icon}</span>
      <span class="cp-idx">${p.index}</span>
      <span class="cp-name">${esc(p.name || '')}</span>
      <span class="cp-time">${time}</span>
    </div>`;
  }).join('');

  // Skip advisor: flag stuck problems
  const stuck = problems.find(p => !p.solved && p.attempted && (p.timeSpent || 0) > 30);
  const unsolved = problems.find(p => !p.attempted && !p.solved);
  if (stuck && unsolved) {
    const advice = document.getElementById('skip-advice');
    advice.style.display = 'block';
    advice.textContent = `💡 You've spent ${stuck.timeSpent}m+ on ${stuck.index}. Consider opening ${unsolved.index} first.`;
  }
}

// ── VS Code Status ────────────────────────────────────────────────────────────
async function checkVSCodeStatus() {
  try {
    await fetch(globalThis.APP_CONFIG.listenerUrl, { method: 'HEAD', signal: AbortSignal.timeout(800) });
    document.getElementById('vscode-status').textContent = 'VS Code: online ✓';
  } catch {
    document.getElementById('vscode-status').textContent = 'VS Code: offline (press F5 in VS Code)';
  }
}

// ── DNA Score Bar ─────────────────────────────────────────────────────────────
async function fetchDNABar() {
  try {
    const res = await fetch(`${backendUrl}/api/dna/profile/${encodeURIComponent(cfHandle)}`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.profile) return;

    const p = data.profile;
    const scores = [
      { label: 'Speed',     val: Math.round(p.avg_speed_score     || 50), color: '#5ecfff' },
      { label: 'Accuracy',  val: Math.round(p.avg_accuracy_score  || 50), color: '#4ade80' },
      { label: 'Resilience',val: Math.round(p.avg_resilience_score|| 50), color: '#a78bfa' },
      { label: 'Clean',     val: Math.round(p.avg_cleanliness_score||50), color: '#fbbf24' },
    ];

    document.getElementById('dna-bar').style.display = 'block';
    document.getElementById('dna-scores').innerHTML = scores.map(s => `
      <div class="dna-score-row">
        <div class="dna-score-label">${s.label}</div>
        <div class="dna-score-bar">
          <div class="dna-score-fill" style="width:${s.val}%;background:${s.color}"></div>
        </div>
        <div class="dna-score-val">${s.val}</div>
      </div>
    `).join('');
  } catch { /* no DNA data yet */ }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function pad(n) { return String(n).padStart(2, '0'); }

// Auto-refresh when storage changes (e.g. content script parsed a new problem)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.currentProblem?.newValue) {
    currentProblem = changes.currentProblem.newValue;
    showProblem(currentProblem);
    fetchAndRenderIntel(currentProblem);
  }
  if (changes.contestStatus?.newValue?.isLive) {
    renderContestPanel(changes.contestStatus.newValue);
  }
  if (changes.cfHandle) cfHandle = changes.cfHandle.newValue || '';
  if (changes.backendUrl) backendUrl = changes.backendUrl.newValue || globalThis.APP_CONFIG.backendUrl;
});
