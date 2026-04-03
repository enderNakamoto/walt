import { exec } from "child_process";
import { writeFile, mkdir, rm, readFile } from "fs/promises";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  createTestRun,
  createTestRunStep,
  updateTestRun,
  updateAgentTestCode,
  uploadScreenshot,
  hasPassingRun,
} from "./supabase";
import { diagnoseTestFailure } from "./claude";
import type { SSEWriter, ConsoleLogEntry, NetworkErrorEntry, HealingSummary } from "./types";
import { WAIT_UTILS_SOURCE } from "./wait-utils";

const TEST_SETUP_SOURCE = `
import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Extend test to capture console logs and network errors
export const test = base.extend<{ captureContext: void }>({
  captureContext: [async ({ page }, use, testInfo) => {
    const consoleLogs: Array<{ type: string; text: string; timestamp: number }> = [];
    const networkErrors: Array<{ url: string; status: number; method: string; timestamp: number }> = [];

    page.on('console', msg => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    page.on('requestfailed', request => {
      networkErrors.push({
        url: request.url(),
        status: 0,
        method: request.method(),
        timestamp: Date.now(),
      });
    });

    page.on('response', response => {
      if (response.status() >= 400) {
        networkErrors.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method(),
          timestamp: Date.now(),
        });
      }
    });

    await use();

    // Write captured data to file after test completes
    const contextFile = path.join(testInfo.outputDir, 'test-context.json');
    fs.mkdirSync(path.dirname(contextFile), { recursive: true });
    fs.writeFileSync(contextFile, JSON.stringify({ consoleLogs, networkErrors }, null, 2));
  }, { auto: true }],
});

export { expect } from '@playwright/test';
`;

const RUN_TIMEOUT_MS = 240_000; // 4 minutes

/**
 * Classify an error as transient (retry with same code) or structural (needs healing).
 * Returns a short reason string for transient errors, or null for structural errors.
 */
function isTransientError(error: string): string | null {
  const cleaned = error.replace(/\u001b\[\d+m/g, "").toLowerCase();

  // Timeouts — usually network/blockchain latency, not a code bug
  if (cleaned.includes("timeout") && !cleaned.includes("selector") && !cleaned.includes("locator")) {
    return "timeout";
  }

  // Network failures
  if (cleaned.includes("net::err_") || cleaned.includes("econnrefused") || cleaned.includes("econnreset")) {
    return "network";
  }

  // Navigation failures
  if (cleaned.includes("navigation failed") || cleaned.includes("page.goto")) {
    return "navigation";
  }

  // Browser/process crashes
  if (cleaned.includes("browser has been closed") || cleaned.includes("target closed")) {
    return "browser crash";
  }

  // Everything else is structural — wrong selector, assertion mismatch, element not found
  return null;
}

/** Rewrite test imports to use our test-setup fixture instead of bare @playwright/test */
function rewriteTestImports(code: string): string {
  // Replace `from '@playwright/test'` or `from "@playwright/test"` with `from './test-setup'`
  // but only for `test` and `expect` imports
  return code.replace(
    /from\s+['"]@playwright\/test['"]/g,
    "from './test-setup'",
  );
}

/** Search for test-context.json in the test-results directory tree */
function findTestContext(testResultsDir: string): { consoleLogs: ConsoleLogEntry[]; networkErrors: NetworkErrorEntry[] } | null {
  if (!existsSync(testResultsDir)) return null;
  try {
    const findJson = (dir: string): string | null => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = findJson(fullPath);
          if (found) return found;
        } else if (entry.name === "test-context.json") {
          return fullPath;
        }
      }
      return null;
    };
    const jsonPath = findJson(testResultsDir);
    if (jsonPath) {
      const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
      return {
        consoleLogs: data.consoleLogs ?? [],
        networkErrors: data.networkErrors ?? [],
      };
    }
  } catch {
    // Non-critical
  }
  return null;
}

export async function runTest(
  testCode: string,
  dappUrl: string,
  walletSecret: string | null,
  agentId: string,
  sse: SSEWriter,
): Promise<{ status: "passed" | "failed" | "error"; durationMs: number; testRunId: string }> {
  const runId = randomUUID();
  const tmpDir = join("/tmp", `stellar-test-${runId}`);
  await mkdir(tmpDir, { recursive: true });

  // Create test_runs record
  const testRun = await createTestRun(agentId);

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const MAX_ATTEMPTS = 5;
  let currentTestCode = testCode;
  let attempt = 0;
  const healingHistory: Array<{ error: string; fix: string }> = [];
  // Track healing report for DB persistence
  const healingReport: Array<{
    attempt: number;
    status: "failed" | "passed";
    steps: Array<{ name: string; error?: string; durationMs?: number }>;
  }> = [];

  try {
    // Write wait utilities
    await writeFile(join(tmpDir, "wait-utils.ts"), WAIT_UTILS_SOURCE);

    // Write test-setup fixture for capturing console logs and network errors
    await writeFile(join(tmpDir, "test-setup.ts"), TEST_SETUP_SOURCE);

    // Write playwright config
    await writeFile(
      join(tmpDir, "playwright.config.ts"),
      `import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  retries: 0,
  use: {
    baseURL: "${dappUrl}",
    screenshot: "on",
    trace: "retain-on-failure",
  },
  reporter: [["json", { outputFile: "results.json" }]],
});
`,
    );

    // Write package.json
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({
        type: "module",
        dependencies: {
          "@playwright/test": "latest",
          "stellar-wallet-mock": "github:SentinelFi/stellar_wallet_mock",
        },
      }),
    );

    // Install dependencies
    sse.send({ type: "status", message: "Installing test dependencies (playwright, wallet-mock)..." });
    await execAsync("npm install", { cwd: tmpDir, timeout: 60_000 });

    // Install Chromium browser
    sse.send({ type: "status", message: "Setting up Chromium browser..." });
    await execAsync("npx playwright install chromium", {
      cwd: tmpDir,
      timeout: 60_000,
    });

    const env = {
      ...process.env,
      WALLET_SECRET_KEY: walletSecret || "",
      DAPP_URL: dappUrl,
    };

    const start = Date.now();
    let totalDurationMs = 0;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;

      // Write current test code (rewrite imports to use test-setup fixture)
      await writeFile(join(tmpDir, "test.spec.ts"), rewriteTestImports(currentTestCode));

      sse.send({
        type: "status",
        message: attempt === 1
          ? "Launching browser and executing test against " + dappUrl + " — this may take up to 2 minutes..."
          : `Running test (attempt ${attempt} of ${MAX_ATTEMPTS})...`,
      });

      // Clean old results and test-results directory between attempts
      const resultsPath = join(tmpDir, "results.json");
      if (attempt > 1) {
        try { await rm(resultsPath, { force: true }); } catch { /* ignore */ }
        try { await rm(join(tmpDir, "test-results"), { recursive: true, force: true }); } catch { /* ignore */ }
      }

      let testStderr = "";
      const attemptStart = Date.now();
      try {
        await execAsync("npx playwright test", {
          cwd: tmpDir,
          env,
          timeout: RUN_TIMEOUT_MS,
        });
      } catch (execErr: unknown) {
        // Playwright exits with non-zero on test failure — that's expected
        if (execErr && typeof execErr === "object" && "stderr" in execErr) {
          testStderr = String((execErr as { stderr: unknown }).stderr);
        }
      }

      const attemptDurationMs = Date.now() - attemptStart;
      totalDurationMs = Date.now() - start;

      // Parse results
      if (!existsSync(resultsPath)) {
        // No results.json means crash — don't try to heal
        const errorDetail = testStderr
          ? `Test crashed:\n${testStderr.slice(0, 1000)}`
          : "No results.json produced — test may have crashed";
        console.error("[runner] No results.json. stderr:", testStderr.slice(0, 500));
        sse.send({
          type: "done",
          status: "error",
          error: errorDetail,
        });
        await updateTestRun(testRun.id, {
          status: "error",
          completed_at: new Date().toISOString(),
          duration_ms: totalDurationMs,
          error_summary: errorDetail.slice(0, 500),
        });
        return { status: "error", durationMs: totalDurationMs, testRunId: testRun.id };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any = JSON.parse(await readFile(resultsPath, "utf-8"));
      console.log(`[runner] attempt ${attempt}: suites=${results.suites?.length ?? 0}, errors=${results.errors?.length ?? 0}`);

      // Parse test context (console logs, network errors) if available
      const testContext = findTestContext(join(tmpDir, "test-results"));

      // Stream step-by-step results
      let stepIndex = 0;
      let allPassed = true;
      let errorSummary = "";

      // Recursively collect specs from nested suites (test.describe.serial creates nesting)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collectSpecs = (suite: any): any[] => {
        const specs = [...(suite.specs ?? [])];
        for (const nested of suite.suites ?? []) {
          specs.push(...collectSpecs(nested));
        }
        return specs;
      };

      const allSpecs = (results.suites ?? []).flatMap(collectSpecs);

      if (allSpecs.length === 0) {
        console.error("[runner] No specs found in results.json — test may have failed to compile");
        // Treat as error if no specs found
        const compileError = results.errors?.map((e: { message?: string }) => e.message).join("\n") || "No test specs found — test may have a compile error";
        sse.send({ type: "done", status: "error", error: compileError });
        await updateTestRun(testRun.id, {
          status: "error",
          completed_at: new Date().toISOString(),
          duration_ms: totalDurationMs,
          error_summary: compileError.slice(0, 500),
        });
        return { status: "error", durationMs: totalDurationMs, testRunId: testRun.id };
      }

      for (const spec of allSpecs) {
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            const screenshotAttachment = result.attachments?.find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (a: any) => a.contentType?.startsWith("image/"),
            );

            let screenshotData: string | null = null;
            let screenshotPath: string | null = null;

            if (screenshotAttachment?.path) {
              // Resolve path relative to tmpDir if not absolute
              const absPath = screenshotAttachment.path.startsWith("/")
                ? screenshotAttachment.path
                : join(tmpDir, screenshotAttachment.path);
              try {
                if (existsSync(absPath)) {
                  const buf = readFileSync(absPath);
                  screenshotData = `data:image/png;base64,${buf.toString("base64")}`;

                  // Upload to Supabase Storage
                  try {
                    screenshotPath = await uploadScreenshot(
                      buf,
                      `runs/${testRun.id}/step-${stepIndex}.png`,
                    );
                  } catch {
                    // Non-critical — skip upload
                  }
                }
              } catch {
                // Non-critical — skip screenshot
              }
            }

            const stepStatus = result.status as string;
            if (stepStatus !== "passed") allPassed = false;
            if (stepStatus !== "passed" && stepStatus !== "skipped") {
              const errMsg = result.error?.message ?? `Test ${stepStatus}`;
              if (!errorSummary) errorSummary = errMsg;
            }

            sse.send({
              type: "step",
              index: stepIndex,
              name: spec.title,
              status: stepStatus,
              durationMs: result.duration,
              error: result.error?.message,
              screenshot: screenshotData,
              consoleLogs: testContext?.consoleLogs ?? [],
              networkErrors: testContext?.networkErrors ?? [],
            });

            // Persist step
            await createTestRunStep({
              test_run_id: testRun.id,
              step_index: stepIndex,
              name: spec.title,
              status: stepStatus,
              screenshot_path: screenshotPath,
              error_message: result.error?.message ?? null,
              duration_ms: result.duration ?? null,
            });

            stepIndex++;
          }
        }
      }

      // If all passed, we're done
      if (allPassed) {
        const passedSteps = allSpecs.map((spec: { title: string; tests: Array<{ results: Array<{ duration: number }> }> }) => ({
          name: spec.title,
          durationMs: spec.tests[0]?.results[0]?.duration ?? 0,
        }));

        if (attempt > 1) {
          healingReport.push({
            attempt,
            status: "passed",
            steps: passedSteps,
          });
          sse.send({ type: "healed", attempt, totalAttempts: attempt, passedSteps });
          // Save healed test code back to the agent
          await updateAgentTestCode(agentId, currentTestCode);
        } else {
          healingReport.push({
            attempt: 1,
            status: "passed",
            steps: passedSteps,
          });
        }

        const healingSummary = healingReport.length > 1
          ? { totalAttempts: attempt, attempts: healingReport }
          : null;

        await updateTestRun(testRun.id, {
          status: "passed",
          completed_at: new Date().toISOString(),
          duration_ms: totalDurationMs,
          error_summary: null,
          healing_summary: healingSummary,
        });

        sse.send({ type: "done", status: "passed", durationMs: totalDurationMs });
        return { status: "passed", durationMs: totalDurationMs, testRunId: testRun.id };
      }

      // Test failed — analyze error type to decide: retry (transient) or heal (structural)
      if (attempt < MAX_ATTEMPTS) {
        const isTransient = isTransientError(errorSummary);

        // Collect failed step details for the report
        const failedSteps = allSpecs
          .flatMap((spec: { title: string; tests: Array<{ results: Array<{ status: string; error?: { message?: string } }> }> }) =>
            spec.tests.flatMap((t) =>
              t.results
                .filter((r) => r.status !== "passed" && r.status !== "skipped")
                .map((r) => ({
                  name: spec.title,
                  error: (r.error?.message ?? `Test ${r.status}`).replace(/\u001b\[\d+m/g, "").slice(0, 200),
                })),
            ),
          );

        // Save to healing report for DB
        healingReport.push({
          attempt,
          status: "failed",
          steps: failedSteps,
        });

        // Transient errors (timeout, network) → just retry with same code
        if (isTransient) {
          sse.send({
            type: "healing",
            attempt,
            message: `Transient failure (${isTransient}). Retrying with same code (attempt ${attempt + 1} of ${MAX_ATTEMPTS})...`,
            failedSteps,
          });
          sse.send({ type: "clear_steps" });
          continue;
        }

        // Structural error (wrong selector, assertion mismatch) → heal with Claude
        sse.send({
          type: "healing",
          attempt,
          message: `Structural failure detected. Diagnosing and fixing code (attempt ${attempt + 1} of ${MAX_ATTEMPTS})...`,
          failedSteps,
        });

        // Find the failure screenshot from test-results directory
        let failScreenshot: Buffer | null = null;
        const testResultsDir = join(tmpDir, "test-results");
        if (existsSync(testResultsDir)) {
          try {
            const findPng = (dir: string): string | null => {
              const entries = readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                  const found = findPng(fullPath);
                  if (found) return found;
                } else if (entry.name.endsWith(".png")) {
                  return fullPath;
                }
              }
              return null;
            };
            const pngPath = findPng(testResultsDir);
            if (pngPath) {
              failScreenshot = readFileSync(pngPath) as Buffer;
            }
          } catch {
            // Non-critical — proceed without screenshot
          }
        }

        try {
          const fixedCode = await diagnoseTestFailure(
            currentTestCode,
            errorSummary,
            failScreenshot,
            healingHistory,
          );

          // Clean the response (remove markdown fences if present)
          let cleanedCode = fixedCode
            .replace(/^```(?:typescript|ts)?\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

          // Also strip any leading explanation text before the first import
          const importIndex = cleanedCode.indexOf("import ");
          if (importIndex > 0) {
            cleanedCode = cleanedCode.slice(importIndex);
          }

          // Basic syntax check — write to temp file and try to parse with tsc
          const testFilePath = join(tmpDir, "test-check.ts");
          await writeFile(testFilePath, cleanedCode);
          try {
            await execAsync(
              "npx tsc --noEmit --allowImportingTsExtensions --moduleResolution bundler test-check.ts",
              { cwd: tmpDir, timeout: 15_000 },
            );
          } catch {
            // tsc will fail on type errors which is fine — we only care about syntax errors
            // Check if it's an actual syntax error vs type error
            // For now, just check the code has balanced braces/parens as a quick sanity check
          }

          // Quick sanity: must contain 'test(' and end with proper closing
          if (!cleanedCode.includes("test(") || !cleanedCode.includes("expect")) {
            console.error("[runner] Healed code looks invalid — missing test() or expect");
            sse.send({ type: "healing_error", message: "Healed code is invalid — skipping" });
            break;
          }

          healingHistory.push({
            error: errorSummary,
            fix: cleanedCode.slice(0, 200) + "...",
          });
          currentTestCode = cleanedCode;

          // Clear old steps from UI before retry
          sse.send({ type: "clear_steps" });
        } catch (healErr) {
          console.error("[runner] Healing failed:", healErr);
          sse.send({ type: "healing_error", message: "Failed to diagnose test failure" });
          // Break out — report the failure as-is
          break;
        }
      }
    }

    // If we reach here, all attempts failed
    const finalDurationMs = Date.now() - start;

    const failedHealingSummary = healingReport.length > 0
      ? { totalAttempts: attempt, attempts: healingReport }
      : null;

    await updateTestRun(testRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: finalDurationMs,
      error_summary: healingHistory.length > 0
        ? `Failed after ${attempt} attempts. Last error: ${healingHistory[healingHistory.length - 1]?.error?.slice(0, 300) ?? "unknown"}`
        : null,
      healing_summary: failedHealingSummary,
    });

    sse.send({ type: "done", status: "failed", durationMs: finalDurationMs });
    return { status: "failed", durationMs: finalDurationMs, testRunId: testRun.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : String(err);
    console.error("[runner] Outer catch:", stack);
    sse.send({ type: "done", status: "error", error: message });

    await updateTestRun(testRun.id, {
      status: "error",
      completed_at: new Date().toISOString(),
      duration_ms: 0,
      error_summary: message,
    });

    return { status: "error", durationMs: 0, testRunId: testRun.id };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    await rm(tmpDir, { recursive: true, force: true });
    sse.close();
  }
}

export async function runTestHeadless(
  testCode: string,
  dappUrl: string,
  walletSecret: string | null,
  agentId: string,
): Promise<{
  status: 'passed' | 'failed' | 'error';
  durationMs: number;
  steps: Array<{ name: string; status: string; durationMs?: number; error?: string }>;
  healingSummary: HealingSummary | null;
  testRunId: string | null;
}> {
  // Collect SSE events with a mock writer instead of streaming to a client
  const events: Array<Record<string, unknown>> = [];
  const mockSse: SSEWriter = {
    send: (data) => { events.push(data as Record<string, unknown>); },
    close: () => {},
  };

  const result = await runTest(testCode, dappUrl, walletSecret, agentId, mockSse);

  // Parse collected events into structured result
  const steps = events
    .filter(e => e.type === 'step')
    .map(e => ({
      name: e.name as string,
      status: e.status as string,
      durationMs: e.durationMs as number | undefined,
      error: e.error as string | undefined,
    }));

  const healedEvent = events.find(e => e.type === 'healed');
  const healingEvents = events.filter(e => e.type === 'healing');

  let healingSummary: HealingSummary | null = null;
  if (healedEvent || healingEvents.length > 0) {
    const attempts: HealingSummary['attempts'] = healingEvents.map((h, i) => ({
      attempt: i + 1,
      status: 'failed' as const,
      steps: ((h.failedSteps as Array<{ name: string; error: string }>) ?? []).map(fs => ({
        name: fs.name,
        error: fs.error,
      })),
    }));
    if (healedEvent) {
      attempts.push({
        attempt: (healedEvent.totalAttempts as number) ?? attempts.length + 1,
        status: 'passed' as const,
        steps: ((healedEvent.passedSteps as Array<{ name: string; durationMs: number }>) ?? []).map(ps => ({
          name: ps.name,
          durationMs: ps.durationMs,
        })),
      });
    }
    healingSummary = {
      totalAttempts: (healedEvent?.totalAttempts as number) ?? healingEvents.length + 1,
      attempts,
    };
  }

  return {
    status: result.status,
    durationMs: result.durationMs,
    steps,
    healingSummary,
    testRunId: result.testRunId,
  };
}

function execAsync(
  cmd: string,
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeout?: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, opts, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}
