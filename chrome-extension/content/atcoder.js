// content/atcoder.js — AtCoder problem parser

(function () {
  'use strict';
  const url = window.location.href;
  const match = url.match(/atcoder\.jp\/contests\/([^/]+)\/tasks\/([^/?]+)/);
  if (!match) return;

  const contestSlug = match[1];
  const taskSlug    = match[2];

  // Problem name
  const title = document.querySelector('.h2, span.h2')?.textContent?.trim()
    || document.title.replace('- AtCoder', '').trim();

  // Time limit
  const timeLimitEl = [...document.querySelectorAll('p')].find(p => /Time Limit/i.test(p.textContent));
  const timeLimitText = timeLimitEl?.textContent?.match(/[\d.]+\s*sec/i)?.[0] || '2 sec';
  const timeLimit = Math.round(parseFloat(timeLimitText) * 1000);

  // Memory limit
  const memLimitEl = [...document.querySelectorAll('p')].find(p => /Memory Limit/i.test(p.textContent));
  const memLimit = parseInt(memLimitEl?.textContent?.match(/\d+/)?.[0] || '256');

  // Sample tests — AtCoder uses section headers "Sample Input 1" / "Sample Output 1"
  const sections = document.querySelectorAll('.part');
  const inputs = [], outputs = [];
  sections.forEach(sec => {
    const header = sec.querySelector('h3')?.textContent?.trim() || '';
    const pre = sec.querySelector('pre');
    if (!pre) return;
    if (/Sample Input/i.test(header))  inputs.push(pre.textContent.trim() + '\n');
    if (/Sample Output/i.test(header)) outputs.push(pre.textContent.trim() + '\n');
  });

  // Fallback: numbered pre#pre-sample-*
  if (inputs.length === 0) {
    let i = 1;
    while (true) {
      const inp = document.getElementById(`pre-sample-${i}`);
      const out = document.getElementById(`pre-sample-${i}-1`);
      if (!inp) break;
      inputs.push(inp.textContent.trim() + '\n');
      if (out) outputs.push(out.textContent.trim() + '\n');
      i++;
    }
  }

  const tests = inputs.map((inp, i) => ({ input: inp, output: outputs[i] || '' }));

  const payload = {
    name:         title,
    group:        `AtCoder — ${contestSlug}`,
    url,
    contestId:    null,
    problemIndex: taskSlug.split('_').pop()?.toUpperCase() || 'A',
    timeLimit,
    memoryLimit:  memLimit,
    tests,
    interactive:  false,
    judge:        'AtCoder'
  };

  chrome.storage.local.set({ currentProblem: payload, lastUpdated: Date.now() });
  chrome.runtime.sendMessage({ type: 'PROBLEM_PARSED', payload });
  injectSendButton(payload);

  function injectSendButton(payload) {
    if (document.getElementById('mycpc-atcoder-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'mycpc-atcoder-btn';
    btn.textContent = '🧬 Send to VS Code';
    btn.style.cssText = 'position:fixed;top:70px;right:16px;z-index:9999;background:#2ea043;color:#fff;border:none;border-radius:6px;padding:7px 14px;cursor:pointer;font-family:sans-serif;font-size:12px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    btn.addEventListener('click', async () => {
      try {
        const res = await fetch(globalThis.APP_CONFIG.listenerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { btn.textContent = '✓ Sent to VS Code!'; btn.style.background = '#4ade80'; btn.style.color = '#000'; }
        else btn.textContent = '✗ VS Code not running';
      } catch { btn.textContent = '✗ Port 10043 unreachable'; }
    });
    document.body.appendChild(btn);
  }
})();
