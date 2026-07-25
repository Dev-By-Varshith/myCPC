// content/cses.js — CSES Problem Set parser

(function () {
  'use strict';
  const url = window.location.href;
  if (!/cses\.fi\/problemset\/task\/\d+/.test(url)) return;

  const title = document.querySelector('.title-block h1, h1')?.textContent?.trim() || 'CSES Problem';

  // CSES has alternating pre blocks: input, output, input, output, ...
  const pres = [...document.querySelectorAll('.content pre, pre')];
  const tests = [];
  for (let i = 0; i + 1 < pres.length; i += 2) {
    tests.push({ input: pres[i].textContent.trim() + '\n', output: pres[i+1].textContent.trim() + '\n' });
  }

  // Time limit from the constraints section
  const timeLimit = 1000; // CSES default 1s
  const memoryLimit = 512;

  const payload = {
    name:         title,
    group:        'CSES Problem Set',
    url,
    contestId:    null,
    problemIndex: 'A',
    timeLimit,
    memoryLimit,
    tests,
    interactive:  false,
    judge:        'CSES'
  };

  chrome.storage.local.set({ currentProblem: payload, lastUpdated: Date.now() });
  chrome.runtime.sendMessage({ type: 'PROBLEM_PARSED', payload });
  injectButton(payload);

  function injectButton(payload) {
    if (document.getElementById('mycpc-cses-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'mycpc-cses-btn';
    btn.textContent = '🧬 Send to VS Code';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:#2ea043;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    btn.addEventListener('click', async () => {
      try {
        const res = await fetch(globalThis.APP_CONFIG.listenerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        btn.textContent = res.ok ? '✓ Sent!' : '✗ Failed';
        btn.style.background = res.ok ? '#4ade80' : '#f87171';
        if (res.ok) btn.style.color = '#000';
      } catch { btn.textContent = '✗ VS Code offline'; btn.style.background = '#f87171'; }
    });
    document.body.appendChild(btn);
  }
})();
