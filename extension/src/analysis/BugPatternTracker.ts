import * as vscode from 'vscode';
import { getBackendUrl } from '../env';

// ── Bug Pattern Tracker ───────────────────────────────────────────────────────
// After 10+ sessions, recognizes recurring bug patterns from the user's DNA
// Surfaces warnings as VS Code diagnostics (squiggly underlines)

export interface BugPattern {
  pattern: string;
  frequency: number;
  suggestion: string;
  severity: vscode.DiagnosticSeverity;
}

export class BugPatternTracker {
  private _diagnosticCollection: vscode.DiagnosticCollection;
  private _patterns: BugPattern[] = [];
  private _cfHandle: string = '';
  private _backendUrl: string = getBackendUrl();
  private _initialized: boolean = false;

  constructor() {
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('mycpc-bugs');
  }

  async init(cfHandle: string, backendUrl: string) {
    this._cfHandle = cfHandle;
    this._backendUrl = backendUrl;
    await this._loadPatterns();
  }

  // ── Load patterns from backend DNA data ──────────────────────────────────────
  private async _loadPatterns() {
    if (!this._cfHandle) return;
    try {
      const res = await fetch(`${this._backendUrl}/api/dna/history/${this._cfHandle}?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const sessions = data.history || [];

      if (sessions.length < 5) return; // Need at least 5 sessions for patterns

      // Analyze patterns from session data
      const patternCounts = {
        integer_overflow: 0,
        array_not_reset: 0,
        off_by_one: 0,
        mod_forgotten: 0,
        wrong_data_type: 0,
        endl_vs_newline: 0,
      };

      for (const session of sessions) {
        const wa = session.wa_count || 0;
        const rewrites = session.rewrite_count || 0;
        const tle = session.tle_count || 0;

        // Heuristics from session signals
        if (wa >= 3 && rewrites >= 2) patternCounts.integer_overflow++;
        if (wa >= 2 && rewrites >= 1) patternCounts.array_not_reset++;
        if (tle >= 2) patternCounts.endl_vs_newline++;
      }

      // Build patterns list
      this._patterns = [];

      if (patternCounts.integer_overflow >= 3) {
        this._patterns.push({
          pattern: 'int_overflow',
          frequency: patternCounts.integer_overflow,
          suggestion: `You have integer overflow issues in ${patternCounts.integer_overflow} of your recent sessions. Consider using long long by default.`,
          severity: vscode.DiagnosticSeverity.Warning
        });
      }

      if (patternCounts.array_not_reset >= 3) {
        this._patterns.push({
          pattern: 'array_reset',
          frequency: patternCounts.array_not_reset,
          suggestion: `You frequently forget to reset global arrays (${patternCounts.array_not_reset} sessions). Add memset() at the start of each test case.`,
          severity: vscode.DiagnosticSeverity.Warning
        });
      }

      if (patternCounts.endl_vs_newline >= 2) {
        this._patterns.push({
          pattern: 'endl_flush',
          frequency: patternCounts.endl_vs_newline,
          suggestion: `TLE in ${patternCounts.endl_vs_newline} sessions. Replace endl with "\\n" — endl flushes the buffer and is 10x slower.`,
          severity: vscode.DiagnosticSeverity.Warning
        });
      }

      this._initialized = true;
    } catch { /* Backend offline, skip */ }
  }

  // ── Analyze current file for known bug patterns ────────────────────────────
  analyzeDocument(document: vscode.TextDocument) {
    if (!this._initialized || this._patterns.length === 0) return;
    if (!['cpp', 'c', 'java'].includes(document.languageId)) return;

    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Check for integer overflow potential
    if (this._patterns.find(p => p.pattern === 'int_overflow')) {
      this._findIntOverflow(document, text, diagnostics);
    }

    // Check for endl vs \n
    if (this._patterns.find(p => p.pattern === 'endl_flush')) {
      this._findEndlUsage(document, text, diagnostics);
    }

    // Check for array reset patterns
    if (this._patterns.find(p => p.pattern === 'array_reset')) {
      this._findArrayReset(document, text, diagnostics);
    }

    this._diagnosticCollection.set(document.uri, diagnostics);
  }

  private _findIntOverflow(doc: vscode.TextDocument, text: string, diagnostics: vscode.Diagnostic[]) {
    // Flag int * int or int + large_constant patterns that look risky
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      // Look for multiplication of int variables that could overflow
      if (/\bint\b.*\*.*\bint\b/.test(line) && !/long long/.test(line)) {
        const range = new vscode.Range(i, 0, i, line.length);
        const diag = new vscode.Diagnostic(
          range,
          '🧬 myCPC: You\'ve had integer overflow issues in recent sessions. Consider: (long long)a * b or use ll typedef.',
          vscode.DiagnosticSeverity.Warning
        );
        diag.source = 'myCPC Bug Pattern';
        diagnostics.push(diag);
      }
    });
  }

  private _findEndlUsage(doc: vscode.TextDocument, text: string, diagnostics: vscode.Diagnostic[]) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/<<\s*endl/.test(line)) {
        const col = line.indexOf('endl');
        const range = new vscode.Range(i, col, i, col + 4);
        const diag = new vscode.Diagnostic(
          range,
          '🧬 myCPC: You\'ve had TLE issues. endl flushes the buffer — use "\\n" for 10x faster I/O.',
          vscode.DiagnosticSeverity.Warning
        );
        diag.source = 'myCPC Bug Pattern';
        diagnostics.push(diag);
      }
    });
  }

  private _findArrayReset(doc: vscode.TextDocument, text: string, diagnostics: vscode.Diagnostic[]) {
    // Detect global array declarations without reset in main/solve
    const hasGlobalArrays = /^(int|long long|bool)\s+\w+\[/.test(text);
    const hasMemset = /memset\s*\(/.test(text) || /fill\s*\(/.test(text);
    const hasMultipleTestCases = /while\s*\(\s*t\s*--/.test(text) || /for\s*\(.*tc.*tc\s*-\s*1/.test(text);

    if (hasGlobalArrays && hasMultipleTestCases && !hasMemset) {
      // Add a diagnostic at line 0 as a general warning
      const range = new vscode.Range(0, 0, 0, 0);
      const diag = new vscode.Diagnostic(
        range,
        '🧬 myCPC: You have global arrays + multiple test cases but no memset/fill. You\'ve had this bug in recent sessions!',
        vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'myCPC Bug Pattern';
      diagnostics.push(diag);
    }
  }

  // ── Get summary of patterns for status bar ────────────────────────────────
  getPatternSummary(): string {
    if (!this._initialized || this._patterns.length === 0) return '';
    return `⚠ ${this._patterns.length} bug patterns detected`;
  }

  // ── Get patterns for hint display ────────────────────────────────────────
  getPatterns(): BugPattern[] { return this._patterns; }

  dispose() {
    this._diagnosticCollection.dispose();
  }
}
