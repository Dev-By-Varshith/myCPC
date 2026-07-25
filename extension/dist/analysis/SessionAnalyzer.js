"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionAnalyzer = void 0;
/**
 * SessionAnalyzer
 * Processes the raw event log from the extension and computes a rich summary
 * for the DNA pipeline. All computation is local — zero API cost.
 */
class SessionAnalyzer {
    static buildSummary(problemName, problemConfig, events, snapshots, finalCode) {
        const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
        const edits = sortedEvents.filter(e => e.event === 'edit');
        const testRuns = sortedEvents.filter(e => e.event === 'test_run');
        const testResults = sortedEvents.filter(e => e.event === 'test_result');
        const startedAt = sortedEvents[0]?.timestamp || Date.now();
        const endedAt = sortedEvents[sortedEvents.length - 1]?.timestamp || Date.now();
        const totalTimeSec = Math.round((endedAt - startedAt) / 1000);
        // Hesitation detection
        const hesitationPauses = [];
        for (let i = 1; i < edits.length; i++) {
            const gapMs = edits[i].timestamp - edits[i - 1].timestamp;
            const gapSec = gapMs / 1000;
            if (gapSec > 120) {
                hesitationPauses.push({
                    startTimestamp: edits[i - 1].timestamp,
                    durationSec: Math.round(gapSec),
                    codeLengthAtPause: edits[i - 1].code_length || 0
                });
            }
        }
        // Rewrite detection: code length drops > 20%
        const codeLengths = edits.map(e => e.code_length || 0).filter(l => l > 0);
        let rewriteCount = 0;
        for (let i = 1; i < codeLengths.length; i++) {
            const prev = codeLengths[i - 1];
            const cur = codeLengths[i];
            if (prev > 100 && cur < prev * 0.80) {
                rewriteCount++;
            }
        }
        const waCount = testResults.filter(e => e.verdict === 'WA').length;
        const tleCount = testResults.filter(e => e.verdict === 'TLE').length;
        const compilationAttempts = testRuns.length;
        return {
            problemName,
            problemConfig,
            events: sortedEvents,
            snapshots,
            finalCode,
            startedAt,
            endedAt,
            totalTimeSec,
            hesitationPauses,
            rewriteCount,
            compilationAttempts,
            waCount,
            tleCount
        };
    }
    /**
     * Compute a human-readable timeline string for display in the report.
     * Groups events into 5-minute buckets for readability.
     */
    static buildReadableTimeline(summary) {
        const lines = [];
        const { events, startedAt, hesitationPauses, compilationAttempts, waCount } = summary;
        lines.push(`▶ Session Started`);
        hesitationPauses.forEach(p => {
            const minIn = Math.round((p.startTimestamp - startedAt) / 60000);
            lines.push(`⏸ ${minIn}m — Thinking pause (${Math.round(p.durationSec / 60)}min silence)`);
        });
        events
            .filter(e => e.event === 'test_result')
            .forEach(e => {
            const minIn = Math.round((e.timestamp - startedAt) / 60000);
            const icon = e.verdict === 'AC' ? '✅' : e.verdict === 'WA' ? '❌' : '⏱';
            lines.push(`${icon} ${minIn}m — ${e.verdict}`);
        });
        lines.push(`🏁 AC — Problem Solved`);
        return lines.join('\n');
    }
    /** Quick local style classification — no LLM needed */
    static classifyStyle(summary) {
        const signals = [];
        const { totalTimeSec, waCount, tleCount, rewriteCount, hesitationPauses, compilationAttempts } = summary;
        const totalMins = totalTimeSec / 60;
        if (tleCount >= 2)
            signals.push('brute-forcer');
        if (waCount >= 4)
            signals.push('panic-submitter');
        if (rewriteCount >= 3)
            signals.push('refactorer');
        if (hesitationPauses.length >= 2 && waCount <= 1)
            signals.push('methodical-planner');
        if (rewriteCount <= 1 && compilationAttempts <= 2)
            signals.push('incremental-builder');
        if (totalMins < 10 && waCount <= 1 && compilationAttempts <= 2)
            signals.push('fast-solver');
        if (hesitationPauses.length === 0 && compilationAttempts >= 5)
            signals.push('trial-and-error');
        if (hesitationPauses.length >= 1 && hesitationPauses[0].durationSec > 300)
            signals.push('deep-thinker');
        if (signals.length === 0)
            signals.push('balanced-solver');
        return signals;
    }
    /** Show a VS Code info notification about the session before sending to LLM */
    static getSessionPreview(summary) {
        const mins = Math.round(summary.totalTimeSec / 60);
        const style = this.classifyStyle(summary);
        return `Session: ${mins}m | ${summary.compilationAttempts} compilations | ${summary.waCount} WAs | Style: ${style.join(', ')}`;
    }
    /**
     * analyzePartial — live mid-session heuristics (called every second from the timer)
     * Works on a partial event array — no session end required.
     * Returns lightweight stats for the DNALivePanel.
     */
    static analyzePartial(events) {
        const edits = events.filter(e => e.event === 'edit').sort((a, b) => a.timestamp - b.timestamp);
        const testResults = events.filter(e => e.event === 'test_result');
        const testRuns = events.filter(e => e.event === 'test_run');
        // Hesitation detection (gaps > 2 min)
        let hesitationCount = 0;
        for (let i = 1; i < edits.length; i++) {
            if ((edits[i].timestamp - edits[i - 1].timestamp) / 1000 > 120)
                hesitationCount++;
        }
        // Rewrite detection (code length drops > 20%)
        const codeLengths = edits.map(e => e.code_length || 0).filter(l => l > 0);
        let rewriteCount = 0;
        for (let i = 1; i < codeLengths.length; i++) {
            if (codeLengths[i - 1] > 100 && codeLengths[i] < codeLengths[i - 1] * 0.8)
                rewriteCount++;
        }
        const waCount = testResults.filter(e => e.verdict === 'WA').length;
        const tleCount = testResults.filter(e => e.verdict === 'TLE').length;
        const compCount = testRuns.length;
        const signals = [];
        if (tleCount >= 2)
            signals.push('brute-forcer');
        if (waCount >= 4)
            signals.push('panic-submitter');
        if (rewriteCount >= 3)
            signals.push('refactorer');
        if (hesitationCount >= 2 && waCount <= 1)
            signals.push('methodical-planner');
        if (rewriteCount <= 1 && compCount <= 2)
            signals.push('incremental-builder');
        if (hesitationCount >= 1 && tleCount === 0)
            signals.push('deep-thinker');
        if (hesitationCount === 0 && compCount >= 5)
            signals.push('trial-and-error');
        return { hesitationCount, rewriteCount, styleSignals: signals };
    }
}
exports.SessionAnalyzer = SessionAnalyzer;
//# sourceMappingURL=SessionAnalyzer.js.map