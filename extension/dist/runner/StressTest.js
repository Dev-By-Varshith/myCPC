"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StressTest = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cp = __importStar(require("child_process"));
const MultiLangRunner_1 = require("./MultiLangRunner");
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
class StressTest {
    static async run(workspacePath, solutionFile, bruteFile, generatorFile, iterations, timeLimitMs, onProgress, signal) {
        const outputDir = path.join(workspacePath, '.mycpc', 'stress_bin');
        if (!fs.existsSync(outputDir))
            fs.mkdirSync(outputDir, { recursive: true });
        const solutionLang = MultiLangRunner_1.MultiLangRunner.detectLanguage(solutionFile);
        const bruteLang = MultiLangRunner_1.MultiLangRunner.detectLanguage(bruteFile);
        const genLang = MultiLangRunner_1.MultiLangRunner.detectLanguage(generatorFile);
        // Compile all three
        const [solComp, bruteComp, genComp] = await Promise.all([
            MultiLangRunner_1.MultiLangRunner.compile(solutionFile, outputDir, solutionLang),
            MultiLangRunner_1.MultiLangRunner.compile(bruteFile, outputDir, bruteLang),
            MultiLangRunner_1.MultiLangRunner.compile(generatorFile, outputDir, genLang),
        ]);
        const errors = [];
        if (!solComp.success)
            errors.push(`Solution compile error: ${solComp.error}`);
        if (!bruteComp.success)
            errors.push(`Brute compile error: ${bruteComp.error}`);
        if (!genComp.success)
            errors.push(`Generator compile error: ${genComp.error}`);
        if (errors.length > 0) {
            return { passed: 0, failed: 0, stopped: true, failingInput: errors.join('\n') };
        }
        let passed = 0;
        let failed = 0;
        for (let i = 1; i <= iterations; i++) {
            if (signal.aborted)
                break;
            onProgress({ current: i, total: iterations });
            // Step 1: Generate input (seed = iteration number)
            const genResult = await this._runGenerator(generatorFile, outputDir, genLang, String(i), 5000);
            if (genResult.code !== 0)
                continue;
            const input = genResult.stdout;
            // Step 2: Run both solutions in parallel
            const [bruteResult, solResult] = await Promise.all([
                MultiLangRunner_1.MultiLangRunner.run(bruteFile, outputDir, bruteLang, input, timeLimitMs),
                MultiLangRunner_1.MultiLangRunner.run(solutionFile, outputDir, solutionLang, input, timeLimitMs),
            ]);
            const bruteOut = MultiLangRunner_1.MultiLangRunner._normalize(bruteResult.stdout);
            const solOut = MultiLangRunner_1.MultiLangRunner._normalize(solResult.stdout);
            if (bruteOut === solOut) {
                passed++;
            }
            else {
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
    static _runGenerator(genFile, outputDir, lang, seed, timeLimitMs) {
        return new Promise((resolve) => {
            const name = path.basename(genFile, path.extname(genFile));
            let cmd;
            switch (lang) {
                case 'cpp': {
                    const exe = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
                    cmd = `"${exe}" ${seed}`;
                    break;
                }
                case 'python':
                    cmd = `python3 "${genFile}" ${seed}`;
                    break;
                case 'java':
                    cmd = `java -cp "${outputDir}" ${name} ${seed}`;
                    break;
                case 'rust': {
                    const exe = path.join(outputDir, process.platform === 'win32' ? `${name}.exe` : name);
                    cmd = `"${exe}" ${seed}`;
                    break;
                }
            }
            const child = cp.spawn(cmd, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            const timer = setTimeout(() => child.kill(), timeLimitMs);
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, code }); });
            child.on('error', () => { clearTimeout(timer); resolve({ stdout: '', code: -1 }); });
        });
    }
}
exports.StressTest = StressTest;
//# sourceMappingURL=StressTest.js.map