// content/codeforces.js
// Runs on every Codeforces problem and contest page.
// Parses the problem data and injects the myCPC sidebar + contest widget.

(function () {
  'use strict';

  // ── Detect page type ────────────────────────────────────────────────────────
  const url = window.location.href;
  const isProblem = /codeforces\.com\/(contest|problemset\/problem|gym)\/(\d+)\/(problem\/)?([A-Z0-9]+)/i.test(url);
  const isContest = /codeforces\.com\/contest\/(\d+)/.test(url) && !isProblem;

  if (isProblem) parseProblem();
  if (isContest || isProblem) injectContestSidekick();

  // ── Parse Problem ────────────────────────────────────────────────────────────

  function parseProblem() {
    const problemDiv = document.querySelector('.problem-statement');
    if (!problemDiv) return;

    // Extract metadata
    const title = document.querySelector('.title')?.textContent?.trim() || 'Unknown';
    const timeLimitEl  = document.querySelector('.time-limit');
    const memoryLimitEl = document.querySelector('.memory-limit');

    const timeLimitText  = timeLimitEl?.textContent?.replace(/[^0-9.]/g, '') || '2';
    const memLimitText   = memoryLimitEl?.textContent?.replace(/[^0-9]/g, '') || '256';
    const timeLimit  = Math.round(parseFloat(timeLimitText) * 1000);
    const memoryLimit = parseInt(memLimitText);

    // Contest/problem index from URL
    const urlMatch = url.match(/contest\/(\d+)\/(?:problem\/)?([A-Z0-9]+)/i)
                  || url.match(/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i)
                  || url.match(/gym\/(\d+)\/(?:problem\/)?([A-Z0-9]+)/i);
    const contestId    = urlMatch ? parseInt(urlMatch[1]) : null;
    const problemIndex = urlMatch ? urlMatch[2].toUpperCase() : 'A';

    // Contest group name
    const contestTitle = document.querySelector('.contest-name a, #header .rtable td a')?.textContent?.trim()
                      || document.title.replace(' - Codeforces', '').trim();

    // Parse sample test cases
    const tests = [];
    const inputDivs  = document.querySelectorAll('.sample-test .input pre');
    const outputDivs = document.querySelectorAll('.sample-test .output pre');
    for (let i = 0; i < inputDivs.length; i++) {
      tests.push({
        input:  cleanPre(inputDivs[i]),
        output: cleanPre(outputDivs[i] || document.createElement('pre'))
      });
    }

    // Is interactive?
    const isInteractive = /interact/i.test(problemDiv.textContent);

    const payload = {
      name:         `${problemIndex}. ${title}`,
      group:        contestTitle,
      url,
      contestId,
      problemIndex,
      timeLimit,
      memoryLimit,
      tests,
      interactive:  isInteractive,
      judge:        'Codeforces',
      languages:    []
    };

    // Store for sidebar
    chrome.storage.local.set({ currentProblem: payload, lastUpdated: Date.now() });

    // Notify background + sidebar
    chrome.runtime.sendMessage({ type: 'PROBLEM_PARSED', payload });

    // Inject the intelligence overlay into the problem page
    injectProblemIntelligence(payload);
  }

  // ── Problem Intelligence Overlay ──────────────────────────────────────────

  function injectProblemIntelligence(payload) {
    // Only inject once
    if (document.getElementById('mycpc-intel')) return;

    const el = document.createElement('div');
    el.id = 'mycpc-intel';
    el.innerHTML = `
      <div style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
        border: 1px solid rgba(94,207,255,0.25);
        border-radius: 8px;
        padding: 10px 14px;
        margin: 10px 0;
        color: #c9d1d9;
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:15px;">🧬</span>
          <span style="font-weight:700;color:#5ecfff;font-size:12px;">myCPC Intelligence</span>
          <span id="mycpc-loading" style="color:#64748b;font-size:10px;margin-left:auto;">Loading your profile...</span>
        </div>
        <div id="mycpc-intel-body" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;"></div>
        <div id="mycpc-similar" style="margin-top:8px;font-size:10px;color:#64748b;"></div>
      </div>
    `;

    // Insert before the problem statement
    const stmt = document.querySelector('.problem-statement');
    if (stmt) stmt.parentNode.insertBefore(el, stmt);

    // Fetch intelligence from backend
    fetchIntelligence(payload).then(intel => {
      const loading = document.getElementById('mycpc-loading');
      if (loading) loading.style.display = 'none';
      renderIntelligence(intel, payload);
    }).catch(() => {
      const loading = document.getElementById('mycpc-loading');
      if (loading) loading.textContent = 'Connect to myCPC to see insights';
    });
  }

  async function fetchIntelligence(payload) {
    const stored = await chrome.storage.local.get(['cfHandle', 'backendUrl']);
    const handle = stored.cfHandle || '';
    const backend = stored.backendUrl || globalThis.APP_CONFIG.backendUrl;
    if (!handle) return null;

    const res = await fetch(`${backend}/api/dna/problem-intel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cfHandle: handle, contestId: payload.contestId, problemIndex: payload.problemIndex, timeLimit: payload.timeLimit, judge: 'Codeforces' })
    });
    return res.ok ? await res.json() : null;
  }

  function renderIntelligence(intel, payload) {
    const body = document.getElementById('mycpc-intel-body');
    const similar = document.getElementById('mycpc-similar');
    if (!body) return;

    const cfDiff = intel?.cfDifficulty || '?';
    const yourDiff = intel?.yourDifficulty || '?';
    const predictedMin = intel?.predictedMinutes || '?';
    const tagAdvisor = intel?.topTags || [];

    body.innerHTML = `
      <div style="background:rgba(94,207,255,0.08);border:1px solid rgba(94,207,255,0.2);border-radius:5px;padding:7px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#5ecfff;">${cfDiff}</div>
        <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase;">CF Rating</div>
      </div>
      <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:5px;padding:7px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#a78bfa;">${yourDiff}</div>
        <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase;">For You</div>
      </div>
      <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:5px;padding:7px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#fbbf24;">~${predictedMin}m</div>
        <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase;">Your Predicted Time</div>
      </div>
    `;

    if (tagAdvisor.length > 0) {
      similar.innerHTML = `
        <span style="color:#64748b;">Tags: </span>
        ${tagAdvisor.map(t => `<span style="background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;border-radius:10px;padding:1px 7px;font-family:monospace;">${t}</span>`).join(' ')}
        <button id="mycpc-send-btn" style="margin-left:8px;background:#2ea043;color:#fff;border:none;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:11px;">▶ Send to VS Code</button>
      `;
      document.getElementById('mycpc-send-btn')?.addEventListener('click', () => sendToVSCode(payload));
    } else {
      similar.innerHTML = `<button id="mycpc-send-btn" style="background:#2ea043;color:#fff;border:none;border-radius:4px;padding:3px 12px;cursor:pointer;font-size:11px;">▶ Send to VS Code</button>`;
      document.getElementById('mycpc-send-btn')?.addEventListener('click', () => sendToVSCode(payload));
    }
  }

  // ── Send to VS Code (port 10043) ─────────────────────────────────────────

  async function sendToVSCode(payload) {
    try {
      const res = await fetch(globalThis.APP_CONFIG.listenerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const btn = document.getElementById('mycpc-send-btn');
        if (btn) { btn.textContent = '✓ Sent!'; btn.style.background = '#4ade80'; btn.style.color = '#000'; }
        chrome.runtime.sendMessage({ type: 'SENT_TO_VSCODE', problem: payload.name });
      } else {
        alert('myCPC: VS Code extension not running. Press F5 in VS Code to start it.');
      }
    } catch {
      alert('myCPC: Cannot reach VS Code extension (port 10043). Make sure the extension is running.');
    }
  }

  // ── Contest Sidekick ─────────────────────────────────────────────────────

  function injectContestSidekick() {
    // Only on contest pages
    const contestMatch = url.match(/contest\/(\d+)/);
    if (!contestMatch) return;
    const contestId = contestMatch[1];

    chrome.runtime.sendMessage({ type: 'CHECK_CONTEST', contestId }, (data) => {
      if (data?.isLive) renderSidekick(data);
    });
  }

  function renderSidekick(data) {
    if (document.getElementById('mycpc-sidekick')) return;

    const widget = document.createElement('div');
    widget.id = 'mycpc-sidekick';
    widget.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      width: 220px;
      background: linear-gradient(135deg, #0d1117, #161b22);
      border: 1px solid rgba(94,207,255,0.3);
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #c9d1d9;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      overflow: hidden;
    `;

    widget.innerHTML = `
      <div style="background:rgba(94,207,255,0.08);padding:8px 12px;display:flex;align-items:center;gap:6px;cursor:pointer;" id="mycpc-sk-header">
        <span>🏆</span>
        <span style="font-weight:700;color:#5ecfff;font-size:11px;">myCPC Contest Coach</span>
        <span id="mycpc-sk-toggle" style="margin-left:auto;color:#64748b;">▼</span>
      </div>
      <div id="mycpc-sk-body" style="padding:10px 12px;">
        <div id="mycpc-timer" style="text-align:center;font-size:22px;font-family:monospace;color:#4ade80;font-weight:700;margin-bottom:8px;">${data.timeRemaining || '--:--:--'}</div>
        <div id="mycpc-problems" style="display:flex;flex-direction:column;gap:4px;"></div>
        <div id="mycpc-skip-advice" style="margin-top:8px;padding:7px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:5px;font-size:10px;color:#fbbf24;display:none;"></div>
        <div style="margin-top:8px;text-align:center;font-size:10px;color:#64748b;" id="mycpc-rank-pred"></div>
      </div>
    `;

    document.body.appendChild(widget);

    // Collapse toggle
    document.getElementById('mycpc-sk-header').addEventListener('click', () => {
      const body = document.getElementById('mycpc-sk-body');
      const toggle = document.getElementById('mycpc-sk-toggle');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      toggle.textContent = hidden ? '▼' : '▶';
    });

    // Start timer
    if (data.endTime) startTimer(data.endTime);

    // Render problems
    if (data.problems) renderProblems(data.problems);
  }

  function startTimer(endTimeMs) {
    function tick() {
      const remaining = endTimeMs - Date.now();
      if (remaining <= 0) { document.getElementById('mycpc-timer').textContent = '00:00:00'; return; }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      const str = `${pad(h)}:${pad(m)}:${pad(s)}`;
      const el = document.getElementById('mycpc-timer');
      if (el) {
        el.textContent = str;
        el.style.color = remaining < 900000 ? '#f87171' : remaining < 1800000 ? '#fbbf24' : '#4ade80';
      }
    }
    tick();
    setInterval(tick, 1000);
  }

  function renderProblems(problems) {
    const container = document.getElementById('mycpc-problems');
    if (!container) return;
    container.innerHTML = problems.map(p => {
      const icon = p.solved ? '✅' : p.attempted ? '🔴' : '⬜';
      const time = p.solvedAt ? formatTime(p.solvedAt) : p.attempted ? `${p.timeSpent}m` : '';
      return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <span>${icon}</span>
        <span style="font-weight:700;color:#5ecfff;">${p.index}</span>
        <span style="flex:1;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name || ''}</span>
        <span style="color:#64748b;font-size:10px;font-family:monospace;">${time}</span>
      </div>`;
    }).join('');
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  function cleanPre(el) {
    return (el.innerText || el.textContent || '').trim() + '\n';
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function formatTime(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${pad(m)}:${pad(s)}`;
  }

})();
