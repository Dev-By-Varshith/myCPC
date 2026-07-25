// content/codechef.js — CodeChef parser

(function () {
  'use strict';
  const url = window.location.href;

  const title = document.querySelector('h1.problem-name, h1')?.textContent?.trim() || 'CodeChef Problem';

  // Time limit
  const tlEl = document.querySelector('.problem-constraints li, [data-label="Time Limit"]');
  const timeLimit = parseInt(tlEl?.textContent?.match(/\d+/)?.[0] || '2') * 1000;
  const memoryLimit = 256;

  // Sample tests from pre blocks
  const pres = [...document.querySelectorAll('.problem-statement pre, .sample-problem pre')];
  const tests = [];
  for (let i = 0; i + 1 < pres.length; i += 2) {
    tests.push({ input: pres[i].textContent.trim() + '\n', output: pres[i+1].textContent.trim() + '\n' });
  }

  const payload = { name: title, group: 'CodeChef', url, contestId: null, problemIndex: 'A', timeLimit, memoryLimit, tests, interactive: false, judge: 'CodeChef' };

  chrome.storage.local.set({ currentProblem: payload, lastUpdated: Date.now() });
  chrome.runtime.sendMessage({ type: 'PROBLEM_PARSED', payload });
  injectButton(payload);

  function injectButton(payload) {
    if (document.getElementById('mycpc-cc-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'mycpc-cc-btn';
    btn.textContent = '🧬 Send to VS Code';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:#2ea043;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;';
    btn.addEventListener('click', async () => {
      try {
        const res = await fetch(globalThis.APP_CONFIG.listenerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        btn.textContent = res.ok ? '✓ Sent!' : '✗ Failed'; btn.style.background = res.ok ? '#4ade80' : '#f87171';
      } catch { btn.textContent = '✗ VS Code offline'; }
    });
    document.body.appendChild(btn);
  }
})();
