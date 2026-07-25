// content/kattis.js — Kattis parser

(function () {
  'use strict';
  const url = window.location.href;
  const match = url.match(/open\.kattis\.com\/problems\/([^/?]+)/);
  if (!match) return;

  const problemSlug = match[1];
  const title = document.querySelector('h1')?.textContent?.trim() || problemSlug;

  const tlEl = document.querySelector('.metadata_table td');
  const timeLimit = parseFloat(tlEl?.textContent?.replace('s','') || '1') * 1000;

  const pres = [...document.querySelectorAll('.sample .input pre, .sample .output pre')];
  const tests = [];
  for (let i = 0; i + 1 < pres.length; i += 2) {
    tests.push({ input: pres[i].textContent.trim() + '\n', output: pres[i+1].textContent.trim() + '\n' });
  }

  const payload = { name: title, group: 'Kattis', url, contestId: null, problemIndex: problemSlug, timeLimit, memoryLimit: 256, tests, interactive: false, judge: 'Kattis' };

  chrome.storage.local.set({ currentProblem: payload, lastUpdated: Date.now() });
  chrome.runtime.sendMessage({ type: 'PROBLEM_PARSED', payload });
  injectButton(payload);

  function injectButton(payload) {
    if (document.getElementById('mycpc-kattis-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'mycpc-kattis-btn';
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
