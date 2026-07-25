import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type Language = 'cpp' | 'python' | 'java' | 'rust';

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  time: number;
  tle: boolean;
}

export interface CompileResult {
  success: boolean;
  error?: string;
}

/**
 * MultiLangRunner
 * Compile + run solutions in C++17, Python3, Java, or Rust.
 * Language is auto-detected from the source file extension, or
 * falls back to the mycpc.language workspace setting.
 */
export class MultiLangRunner {

  // ── Language Detection ────────────────────────────────────────────────────

  static detectLanguage(filePath: string): Language {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.cpp': case '.cc': case '.cxx': return 'cpp';
      case '.py':  return 'python';
      case '.java': return 'java';
      case '.rs':  return 'rust';
      default:
        return (vscode.workspace.getConfiguration('mycpc').get<string>('language') || 'cpp') as Language;
    }
  }

  // ── Compile ───────────────────────────────────────────────────────────────

  static async compile(sourceFile: string, outputDir: string, lang: Language): Promise<CompileResult> {
    const name = path.basename(sourceFile, path.extname(sourceFile));

    switch (lang) {
      case 'cpp': {
        const flags = vscode.workspace.getConfiguration('mycpc').get<string>('cppCompileFlags') || '-O2 -std=c++17';
        const exePath = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
        return this._exec(`g++ ${flags} "${sourceFile}" -o "${exePath}"`);
      }
      case 'java': {
        return this._exec(`javac -d "${outputDir}" "${sourceFile}"`);
      }
      case 'rust': {
        const exePath = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
        return this._exec(`rustc -O "${sourceFile}" -o "${exePath}"`);
      }
      case 'python':
        // No compile step — validate syntax only
        return this._exec(`python3 -m py_compile "${sourceFile}"`);
      default:
        return { success: false, error: `Unknown language: ${lang}` };
    }
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  static async run(
    sourceFile: string,
    outputDir: string,
    lang: Language,
    input: string,
    timeLimitMs: number
  ): Promise<RunResult> {
    const name = path.basename(sourceFile, path.extname(sourceFile));

    let cmd: string;
    switch (lang) {
      case 'cpp': {
        const exe = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
        cmd = `"${exe}"`;
        break;
      }
      case 'java': {
        // Find the public class name from the source
        const src = fs.readFileSync(sourceFile, 'utf8');
        const classMatch = src.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : name;
        cmd = `java -cp "${outputDir}" ${className}`;
        break;
      }
      case 'rust': {
        const exe = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
        cmd = `"${exe}"`;
        break;
      }
      case 'python':
        cmd = `python3 "${sourceFile}"`;
        break;
      default:
        return { stdout: '', stderr: `Unknown language: ${lang}`, code: -1, time: 0, tle: false };
    }

    return this._runWithInput(cmd, input, timeLimitMs);
  }

  // ── Batch: Compile Once, Run Many ─────────────────────────────────────────

  static async compileAndRunAll(
    sourceFile: string,
    outputDir: string,
    tests: { input: string; output: string }[],
    timeLimitMs: number,
    onTestUpdate?: (index: number, result: TestCaseResult) => void
  ): Promise<{ compileError?: string; results: TestCaseResult[] }> {
    const lang = this.detectLanguage(sourceFile);

    // Compile
    const compileResult = await this.compile(sourceFile, outputDir, lang);
    if (!compileResult.success) {
      return { compileError: compileResult.error, results: [] };
    }

    // Run each test
    const results: TestCaseResult[] = [];
    for (let i = 0; i < tests.length; i++) {
      const runResult = await this.run(sourceFile, outputDir, lang, tests[i].input, timeLimitMs);
      const expected = this._normalize(tests[i].output);
      const actual = this._normalize(runResult.stdout);

      let status: 'AC' | 'WA' | 'TLE' | 'RE' | 'Pending';
      if (runResult.tle) {
        status = 'TLE';
      } else if (runResult.code !== 0) {
        status = 'RE';
      } else if (expected === actual) {
        status = 'AC';
      } else {
        status = 'WA';
      }

      const tcResult: TestCaseResult = {
        index: i,
        status,
        input: tests[i].input,
        expectedOutput: tests[i].output,
        actualOutput: runResult.stdout,
        stderr: runResult.stderr,
        time: runResult.time
      };

      results.push(tcResult);
      if (onTestUpdate) onTestUpdate(i, tcResult);
    }

    return { results };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private static _exec(cmd: string): Promise<CompileResult> {
    return new Promise((resolve) => {
      cp.exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || stdout || error.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  private static _runWithInput(cmd: string, input: string, timeLimitMs: number): Promise<RunResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      const prog = parts[0].replace(/"/g, '');
      const args = parts.slice(1).map(a => a.replace(/"/g, ''));

      const child = cp.spawn(prog, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      let tle = false;

      const timer = setTimeout(() => {
        tle = true;
        child.kill('SIGKILL');
      }, timeLimitMs + 500); // 500ms grace

      child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? -1, time: Date.now() - start, tle });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ stdout: '', stderr: err.message, code: -1, time: Date.now() - start, tle: false });
      });

      try {
        child.stdin?.write(input);
        child.stdin?.end();
      } catch (_) {}
    });
  }

  static _normalize(str: string): string {
    if (!str) return '';
    return str.trim().replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  }

  // ── Language Display Name ─────────────────────────────────────────────────

  static langLabel(lang: Language): string {
    switch (lang) {
      case 'cpp':    return 'C++17';
      case 'python': return 'Python3';
      case 'java':   return 'Java';
      case 'rust':   return 'Rust';
    }
  }

  // ── CF Language ID Mapping (for auto-submit) ──────────────────────────────
  static cfProgramTypeId(lang: Language): string {
    // Codeforces programTypeId values
    switch (lang) {
      case 'cpp':    return '54';   // GNU G++17 7.3.0
      case 'python': return '31';   // Python 3.8.10
      case 'java':   return '60';   // Java 11.0.6
      case 'rust':   return '49';   // Rust 1.49.0
    }
  }
}

export interface TestCaseResult {
  index: number;
  status: 'AC' | 'WA' | 'TLE' | 'RE' | 'Pending';
  input: string;
  expectedOutput: string;
  actualOutput: string;
  stderr: string;
  time: number;
}
