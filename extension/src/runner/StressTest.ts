import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { MultiLangRunner, Language } from './MultiLangRunner';

export interface StressResult {
  passed: number;
  failed: number;
  failingInput?: string;
  bruteOutput?: string;
  optOutput?: string;
  testIndex?: number;
  stopped: boolean;
}

export interface StressProgress {
  current: number;
  total: number;
  lastInput?: string;
}

/**
 * StressTest
 * 
 * Runs a stress test loop:
 *  1. Call generator.{py/cpp} with seed → produces random stdin input
 *  2. Run brute.{cpp/py} on that input
 *  3. Run solution.{cpp/py} on that input
 *  4. Compare outputs — stop on first mismatch
 * 
 * If the generator is a .cpp file, it is compiled first.
 * The generator receives the test number as argv[1] (usable as seed).
 */
export class StressTest {

  static async run(
    workspacePath: string,
    solutionFile: string,
    bruteFile: string,
    generatorFile: string,
    iterations: number,
    timeLimitMs: number,
    onProgress: (p: StressProgress) => void,
    signal: { aborted: boolean }
  ): Promise<StressResult> {
    const outputDir = path.join(workspacePath, '.mycpc', 'stress_bin');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const solutionLang = MultiLangRunner.detectLanguage(solutionFile);
    const bruteLang = MultiLangRunner.detectLanguage(bruteFile);
    const genLang = MultiLangRunner.detectLanguage(generatorFile);

    // Compile all three
    const [solComp, bruteComp, genComp] = await Promise.all([
      MultiLangRunner.compile(solutionFile, outputDir, solutionLang),
      MultiLangRunner.compile(bruteFile, outputDir, bruteLang),
      MultiLangRunner.compile(generatorFile, outputDir, genLang),
    ]);

    const errors = [];
    if (!solComp.success) errors.push(`Solution compile error: ${solComp.error}`);
    if (!bruteComp.success) errors.push(`Brute compile error: ${bruteComp.error}`);
    if (!genComp.success) errors.push(`Generator compile error: ${genComp.error}`);

    if (errors.length > 0) {
      return { passed: 0, failed: 0, stopped: true, failingInput: errors.join('\n') };
    }

    let passed = 0;
    let failed = 0;

    for (let i = 1; i <= iterations; i++) {
      if (signal.aborted) break;

      onProgress({ current: i, total: iterations });

      // Step 1: Generate input (seed = iteration number)
      const genResult = await this._runGenerator(generatorFile, outputDir, genLang, String(i), 5000);
      if (genResult.code !== 0) continue;
      const input = genResult.stdout;

      // Step 2: Run both solutions in parallel
      const [bruteResult, solResult] = await Promise.all([
        MultiLangRunner.run(bruteFile, outputDir, bruteLang, input, timeLimitMs),
        MultiLangRunner.run(solutionFile, outputDir, solutionLang, input, timeLimitMs),
      ]);

      const bruteOut = MultiLangRunner._normalize(bruteResult.stdout);
      const solOut   = MultiLangRunner._normalize(solResult.stdout);

      if (bruteOut === solOut) {
        passed++;
      } else {
        failed++;
        onProgress({ current: i, total: iterations, lastInput: input });
        return {
          passed, failed, stopped: false,
          failingInput: input,
          bruteOutput: bruteResult.stdout,
          optOutput: solResult.stdout,
          testIndex: i
        };
      }
    }

    return { passed, failed, stopped: signal.aborted };
  }

  private static _runGenerator(
    genFile: string,
    outputDir: string,
    lang: Language,
    seed: string,
    timeLimitMs: number
  ): Promise<{ stdout: string; code: number | null }> {
    return new Promise((resolve) => {
      const name = path.basename(genFile, path.extname(genFile));
      let cmd: string;

      switch (lang) {
        case 'cpp': {
          const exe = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
          cmd = `"${exe}" ${seed}`;
          break;
        }
        case 'python': cmd = `python3 "${genFile}" ${seed}`; break;
        case 'java':   cmd = `java -cp "${outputDir}" ${name} ${seed}`; break;
        case 'rust': {
          const exe = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
          cmd = `"${exe}" ${seed}`;
          break;
        }
      }

      const child = cp.spawn(cmd!, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      const timer = setTimeout(() => child.kill(), timeLimitMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, code }); });
      child.on('error', () => { clearTimeout(timer); resolve({ stdout: '', code: -1 }); });
    });
  }
}
