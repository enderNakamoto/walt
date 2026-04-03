import { exec } from "child_process";
import { writeFile, mkdir, rm, readFile } from "fs/promises";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  createTestRun,
  createTestRunStep,
  updateTestRun,
  uploadScreenshot,
} from "./supabase";
import type { SSEWriter } from "./types";

const RUN_TIMEOUT_MS = 120_000; // 2 minutes

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

  try {
    // Write test file
    await writeFile(join(tmpDir, "test.spec.ts"), testCode);

    // Write playwright config
    await writeFile(
      join(tmpDir, "playwright.config.ts"),
      `import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 45_000 },
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

    // Run test
    sse.send({ type: "status", message: "Launching browser and executing test against " + dappUrl + " — this may take up to 2 minutes..." });

    const env = {
      ...process.env,
      WALLET_SECRET_KEY: walletSecret || "",
      DAPP_URL: dappUrl,
    };

    const start = Date.now();

    let testStderr = "";
    try {
      await execAsync("npx playwright test", {
        cwd: tmpDir,
        env,
        timeout: RUN_TIMEOUT_MS,
      });
    } catch (execErr: unknown) {
      // Playwright exits with non-zero on test failure — that's expected
      // Capture stderr for error reporting
      if (execErr && typeof execErr === "object" && "stderr" in execErr) {
        testStderr = String((execErr as { stderr: unknown }).stderr);
      }
    }

    const durationMs = Date.now() - start;

    // Parse results
    const resultsPath = join(tmpDir, "results.json");
    if (!existsSync(resultsPath)) {
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
        duration_ms: durationMs,
        error_summary: errorDetail.slice(0, 500),
      });
      return { status: "error", durationMs };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any = JSON.parse(await readFile(resultsPath, "utf-8"));

    // Stream step-by-step results
    let stepIndex = 0;
    let allPassed = true;
    let errorSummary = "";

    // Recursively collect specs from nested suites (test.describe.serial creates nesting)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function collectSpecs(suite: any): any[] {
      const specs = [...(suite.specs ?? [])];
      for (const nested of suite.suites ?? []) {
        specs.push(...collectSpecs(nested));
      }
      return specs;
    }

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

          if (screenshotAttachment?.path && existsSync(screenshotAttachment.path)) {
            const buf = readFileSync(screenshotAttachment.path);
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

          const stepStatus = result.status as "passed" | "failed" | "skipped";
          if (stepStatus !== "passed") allPassed = false;
          if (stepStatus === "failed" && result.error?.message) {
            errorSummary = result.error.message;
          }

          sse.send({
            type: "step",
            index: stepIndex,
            name: spec.title,
            status: stepStatus,
            durationMs: result.duration,
            error: result.error?.message,
            screenshot: screenshotData,
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

    const status = allPassed ? "passed" : "failed";

    // Update test run record
    await updateTestRun(testRun.id, {
      status,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      error_summary: errorSummary || null,
    });

    sse.send({ type: "done", status, durationMs });
    return { status, durationMs };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Test execution failed";
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
