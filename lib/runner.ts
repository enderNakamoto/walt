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
} from "./supabase";
import { diagnoseTestFailure } from "./claude";
import type { SSEWriter, ConsoleLogEntry, NetworkErrorEntry } from "./types";
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
): Promise<{ status: "passed" | "failed" | "error"; durationMs: number }> {
  const runId = randomUUID();
  const tmpDir = join("/tmp", `stellar-test-${runId}`);
  await mkdir(tmpDir, { recursive: true });

  // Create test_runs record
  const testRun = await createTestRun(agentId);

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const MAX_ATTEMPTS = 3;
  let currentTestCode = testCode;
  let attempt = 0;
  const healingHistory: Array<{ error: string; fix: string }> = [];

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
          : `Re-running with healed test (attempt ${attempt} of ${MAX_ATTEMPTS})...`,
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
        return { status: "error", durationMs: totalDurationMs };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any = JSON.parse(await readFile(resultsPath, "utf-8"));

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
        if (attempt > 1) {
          sse.send({ type: "healed", attempt, totalAttempts: attempt });
          // Save healed test code back to the agent
          await updateAgentTestCode(agentId, currentTestCode);
        }

        await updateTestRun(testRun.id, {
          status: "passed",
          completed_at: new Date().toISOString(),
          duration_ms: totalDurationMs,
          error_summary: null,
        });

        sse.send({ type: "done", status: "passed", durationMs: totalDurationMs });
        return { status: "passed", durationMs: totalDurationMs };
      }

      // Test failed — try healing if we have attempts left
      if (attempt < MAX_ATTEMPTS) {
        sse.send({
          type: "healing",
          attempt,
          message: `Test failed. Diagnosing and attempting to fix (attempt ${attempt + 1} of ${MAX_ATTEMPTS})...`,
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
          const cleanedCode = fixedCode
            .replace(/^```(?:typescript|ts)?\n?/, "")
            .replace(/\n?```$/, "")
            .trim();

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

    await updateTestRun(testRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: finalDurationMs,
      error_summary: healingHistory.length > 0
        ? `Failed after ${attempt} attempts. Last error: ${healingHistory[healingHistory.length - 1]?.error?.slice(0, 300) ?? "unknown"}`
        : null,
    });

    sse.send({ type: "done", status: "failed", durationMs: finalDurationMs });
    return { status: "failed", durationMs: finalDurationMs };
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

    return { status: "error", durationMs: 0 };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    await rm(tmpDir, { recursive: true, force: true });
    sse.close();
  }
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
