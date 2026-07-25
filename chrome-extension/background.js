import './config.js';

// background.js — myCPC Chrome Extension Service Worker
// Handles: message routing, CF contest status polling, session state, auth sync

'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let currentContest = null;  // { id, startTime, endTime, problems }
let contestPollInterval = null;

// ── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'PROBLEM_PARSED':
      // Store problem and open side panel
      chrome.storage.local.set({ currentProblem: msg.payload, lastUpdated: Date.now() });
      // Notify any open sidebar
      chrome.runtime.sendMessage({ type: 'SIDEBAR_UPDATE', payload: msg.payload }).catch(() => {});
      break;

    case 'SEND_TO_VSCODE':
      sendToVSCode(msg.payload).then(sendResponse);
      return true; // keep channel open for async

    case 'CHECK_CONTEST':
      checkContestStatus(msg.contestId).then(sendResponse);
      return true;

    case 'GET_INTEL':
      getProblemIntelligence(msg.payload).then(sendResponse);
      return true;

    case 'SAVE_CF_CREDS':
      // Store CF session credentials encrypted
      chrome.storage.session.set({
        cfJsessionid: msg.jsessionid,
        cfCsrfToken:  msg.csrfToken
      });
      // Optionally sync to myCPC backend
      syncCredsToBackend(msg).then(sendResponse);
      return true;

    case 'GET_STORED_PROBLEM':
      chrome.storage.local.get(['currentProblem'], sendResponse);
      return true;

    case 'SENT_TO_VSCODE':
      // Show a brief notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'myCPC: Problem Sent!',
        message: `"${msg.problem}" is now open in VS Code. DNA tracking started!`
      });
      break;

    case 'PASSIVE_EVENT':
      // Route passive capture events to backend for DNA enrichment
      sendPassiveEvent(msg.payload).catch(() => {});
      break;
  }
});

// ── Send to VS Code (port 10043) ─────────────────────────────────────────────

async function sendToVSCode(payload) {
  try {
    const res = await fetch(globalThis.APP_CONFIG.listenerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { success: res.ok, status: res.status };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── CF Contest Status ─────────────────────────────────────────────────────────

async function checkContestStatus(contestId) {
  try {
    const res = await fetch(`https://codeforces.com/api/contest.standings?contestId=${contestId}&from=1&count=1&showUnofficial=false`);
    const json = await res.json();
    if (json.status !== 'OK') return { isLive: false };

    const contest = json.result.contest;
    const now = Date.now();
    const startMs = contest.startTimeSeconds * 1000;
    const durationMs = contest.durationSeconds * 1000;
    const endMs = startMs + durationMs;
    const isLive = now >= startMs && now < endMs;

    // Get stored handle for personal problem tracking
    const stored = await chrome.storage.local.get(['cfHandle']);
    let solvedProblems = [];

    if (stored.cfHandle && isLive) {
      const statusRes = await fetch(`https://codeforces.com/api/user.status?handle=${stored.cfHandle}&from=1&count=20`);
      const statusJson = await statusRes.json();
      if (statusJson.status === 'OK') {
        solvedProblems = statusJson.result
          .filter(s => s.contestId === parseInt(contestId) && s.verdict === 'OK')
          .map(s => s.problem.index);
      }
    }

    const problems = (json.result.problems || []).map((p, i) => ({
      index: p.index,
      name: p.name,
      solved: solvedProblems.includes(p.index),
      attempted: false,
      timeSpent: 0,
      solvedAt: null
    }));

    return {
      isLive,
      contestName: contest.name,
      startTime: startMs,
      endTime: endMs,
      timeRemaining: formatTimeRemaining(endMs - now),
      problems
    };
  } catch (e) {
    return { isLive: false, error: e.message };
  }
}

// ── Problem Intelligence ──────────────────────────────────────────────────────

async function getProblemIntelligence(payload) {
  try {
    const stored = await chrome.storage.local.get(['cfHandle', 'backendUrl']);
    const handle = stored.cfHandle || '';
    const backend = stored.backendUrl || globalThis.APP_CONFIG.backendUrl;
    if (!handle) return null;

    const res = await fetch(`${backend}/api/dna/problem-intel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cfHandle: handle, ...payload })
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// ── Credentials Sync to myCPC Backend ────────────────────────────────────────

async function syncCredsToBackend({ jsessionid, csrfToken, cfHandle }) {
  try {
    const stored = await chrome.storage.local.get(['backendUrl']);
    const backend = stored.backendUrl || globalThis.APP_CONFIG.backendUrl;

    const res = await fetch(`${backend}/api/auth/cf-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cfHandle, jsessionid, csrfToken })
    });
    return { success: res.ok };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Passive Event Routing ─────────────────────────────────────────────────────
async function sendPassiveEvent(payload) {
  try {
    const stored = await chrome.storage.local.get(['backendUrl']);
    const backend = stored.backendUrl || globalThis.APP_CONFIG.backendUrl;
    await fetch(`${backend}/api/dna/passive-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch { /* backend offline, skip silently */ }
}


// ── Utilities ─────────────────────────────────────────────────────────────────

function formatTimeRemaining(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── Alarm for Contest Polling ──────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'contestPoll') {
    chrome.storage.local.get(['activeContestId'], async (data) => {
      if (data.activeContestId) {
        const status = await checkContestStatus(data.activeContestId);
        chrome.storage.local.set({ contestStatus: status });
        chrome.runtime.sendMessage({ type: 'CONTEST_UPDATE', status }).catch(() => {});
      }
    });
  }
});

// ── Install / Update ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'popup/popup.html?welcome=1' });
    chrome.storage.local.set({
      backendUrl:   globalThis.APP_CONFIG.backendUrl,
      cfHandle:     '',
      tagVisibility: 'hide',  // 'show' | 'hide' | 'hint'
      autoSendToVSCode: false
    });
  }
});
