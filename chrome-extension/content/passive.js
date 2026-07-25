

// content/passive.js — myCPC Passive Capture
// Tracks: editorial opens, accepted code viewing, problem statement reading time, standings checks
// All events are sent to backend to enrich the user's DNA profile

(function () {
  'use strict';

  const url = window.location.href;
  const pageType = detectPageType(url);
  if (!pageType) return;

  const startTime = Date.now();
  let eventFired  = false;

  function detectPageType(href) {
    if (/codeforces\.com\/blog\/entry\/\d+/.test(href)) return 'editorial';
    if (/codeforces\.com\/contest\/\d+\/submission\/\d+/.test(href)) return 'submission_view';
    if (/codeforces\.com\/contest\/\d+\/standings/.test(href)) return 'standings_check';
    if (/codeforces\.com\/(contest|problemset\/problem|gym)\/\d+\/(problem\/)?[A-Z0-9]+/i.test(href)) return 'problem_read';
    return null;
  }

  async function reportEvent(type, extra = {}) {
    if (eventFired && type !== 'page_exit') return;
    eventFired = true;

    const stored = await chrome.storage.local.get(['cfHandle', 'backendUrl']);
    if (!stored.cfHandle) return;

    const payload = {
      cfHandle: stored.cfHandle,
      eventType: type,
      url,
      timeSpentMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      ...extra
    };

    // Send to background for routing (avoids CORS issues in content scripts)
    chrome.runtime.sendMessage({ type: 'PASSIVE_EVENT', payload }).catch(() => {});
  }

  // ── Editorial opens ──────────────────────────────────────────────────────────
  if (pageType === 'editorial') {
    // Fire after 3 seconds of reading (not just a click-through)
    setTimeout(() => reportEvent('editorial_open', { url }), 3000);

    // Report total read time on exit
    window.addEventListener('beforeunload', () => {
      reportEvent('editorial_exit', { durationMs: Date.now() - startTime });
    });
  }

  // ── Accepted solution viewing ────────────────────────────────────────────────
  if (pageType === 'submission_view') {
    // Wait for the page to load the code
    const observer = new MutationObserver(() => {
      const codeEl = document.querySelector('#program-source-text, .source-code');
      if (codeEl) {
        observer.disconnect();
        // Only report if they actually scroll into the code (not just checking verdict)
        const io = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            io.disconnect();
            // Extract whose submission it is
            const authorEl = document.querySelector('.standings-table a, .contestant a, a[href^="/profile/"]');
            const author = authorEl?.textContent?.trim() || '';
            reportEvent('solution_peek', { author, url });
          }
        }, { threshold: 0.5 });
        io.observe(codeEl);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Standings obsession ──────────────────────────────────────────────────────
  if (pageType === 'standings_check') {
    // Track repeated standings checks
    chrome.storage.local.get(['standingsChecks', 'standingsContest'], (data) => {
      const contestMatch = url.match(/contest\/(\d+)/);
      const contestId = contestMatch?.[1] || '';
      const prev = data.standingsChecks || {};
      const key  = contestId;

      if (!prev[key]) prev[key] = { count: 0, firstAt: new Date().toISOString() };
      prev[key].count++;
      prev[key].lastAt = new Date().toISOString();

      chrome.storage.local.set({ standingsChecks: prev });

      if (prev[key].count >= 3) {
        // Possible pressure/anxiety signal
        reportEvent('standings_obsession', { contestId, checkCount: prev[key].count });
      } else {
        reportEvent('standings_check', { contestId });
      }
    });
  }

  // ── Problem reading time ─────────────────────────────────────────────────────
  if (pageType === 'problem_read') {
    // Report how long they read before any code editor opens
    // This is a signal for problem comprehension speed
    const reportReadTime = () => {
      const readTimeMs = Date.now() - startTime;
      if (readTimeMs > 10000) { // Only report if >10s (actual reading)
        chrome.storage.local.get(['currentProblem'], (data) => {
          const p = data.currentProblem;
          reportEvent('problem_read_time', {
            readTimeMs,
            contestId: p?.contestId,
            problemIndex: p?.problemIndex
          });
        });
      }
    };

    // Fire when user switches to another tab (went to code editor / IDE)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) reportReadTime();
    });

    window.addEventListener('beforeunload', reportReadTime);
  }

})();
