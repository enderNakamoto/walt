import { chromium, type Page, type Browser } from "playwright";
import { installMockStellarWallet } from "stellar-wallet-mock";
import { describeScreenshot } from "../claude";
import {
  upsertSnapshot,
  updateProjectExplorationData,
  uploadScreenshot,
  getSnapshots,
} from "../supabase";
import type { SSEWriter, PageSelectors, ExplorationData } from "../types";

const EXPLORATION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export async function explore(
  dappUrl: string,
  walletSecret: string | null,
  sse: SSEWriter,
  projectId: string,
  signal?: AbortSignal,
): Promise<void> {
  let browser: Browser | null = null;

  const timeout = setTimeout(() => {
    sse.send({ type: "error", message: "Exploration timed out after 2 minutes" });
    browser?.close();
  }, EXPLORATION_TIMEOUT_MS);

  // Abort on client disconnect
  signal?.addEventListener("abort", () => {
    browser?.close();
  });

  try {
    browser = await chromium.launch();
    const page = await browser.newPage();

    // Install wallet mock BEFORE any navigation
    if (walletSecret) {
      sse.send({ type: "status", message: "Installing wallet mock..." });
      await installMockStellarWallet({ page, secretKey: walletSecret });
    }

    const visited = new Set<string>();
    const toVisit = [dappUrl];
    const origin = new URL(dappUrl).origin;
    const collectedSnapshots: ExplorationData["snapshots"] = [];

    while (toVisit.length > 0) {
      if (signal?.aborted) break;

      const url = toVisit.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      // Navigate
      sse.send({ type: "status", message: `Navigating to ${url}...` });
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      } catch {
        sse.send({ type: "status", message: `Failed to load ${url}, skipping...` });
        continue;
      }

      // Screenshot — stream JPEG to browser immediately
      const screenshotBuf = await page.screenshot({ type: "jpeg", quality: 60 });
      sse.send({
        type: "screenshot",
        url,
        image: `data:image/jpeg;base64,${screenshotBuf.toString("base64")}`,
      });

      // Extract interactive elements from DOM
      const selectors = await extractSelectors(page);

      // Ask Claude to describe the page (vision)
      const summary = await describeScreenshot(
        screenshotBuf,
        `Describe this page of a Stellar dApp. URL: ${url}\n`
          + `Interactive elements found: ${JSON.stringify(selectors)}`,
      );

      sse.send({ type: "page_summary", url, summary, selectors });

      // Upload PNG to Supabase Storage + save snapshot to DB
      const pngBuf = await page.screenshot({ type: "png" });
      const storagePath = await uploadToStorage(pngBuf, projectId, url);
      await upsertSnapshot({
        project_id: projectId,
        url,
        screenshot_path: storagePath,
        dom_summary: summary,
        selectors,
      });

      collectedSnapshots.push({ url, dom_summary: summary, selectors });

      // Discover new links
      const links = await page.$$eval("a[href]", (els) =>
        els.map((a) => (a as HTMLAnchorElement).href),
      );
      for (const link of links) {
        const normalized = link.split("#")[0].split("?")[0];
        if (
          normalized.startsWith(origin) &&
          !visited.has(normalized) &&
          !toVisit.includes(normalized)
        ) {
          toVisit.push(normalized);
          sse.send({ type: "page_discovered", url: normalized });
        }
      }
    }

    // Cache exploration summary on project
    const explorationData: ExplorationData = {
      dappUrl,
      snapshots: collectedSnapshots,
    };
    await updateProjectExplorationData(projectId, explorationData);

    sse.send({ type: "done", totalPages: visited.size });
  } finally {
    clearTimeout(timeout);
    await browser?.close();
    sse.close();
  }
}

// ── Selector extraction ──

async function extractSelectors(page: Page): Promise<PageSelectors> {
  return page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll("button, [role='button']"),
    ).map((el) => ({
      text: el.textContent?.trim()?.slice(0, 100) || null,
      testId: el.getAttribute("data-testid"),
      selector: el.getAttribute("data-testid")
        ? `[data-testid="${el.getAttribute("data-testid")}"]`
        : el.getAttribute("aria-label")
          ? `[aria-label="${el.getAttribute("aria-label")}"]`
          : null,
    }));

    const inputs = Array.from(
      document.querySelectorAll("input, textarea, select"),
    ).map((el) => ({
      label:
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        null,
      testId: el.getAttribute("data-testid"),
      type: el.getAttribute("type"),
      selector: el.getAttribute("data-testid")
        ? `[data-testid="${el.getAttribute("data-testid")}"]`
        : null,
    }));

    const links = Array.from(document.querySelectorAll("a[href]")).map(
      (el) => ({
        text: el.textContent?.trim()?.slice(0, 100) || null,
        href: (el as HTMLAnchorElement).href,
      }),
    );

    return { buttons, inputs, links };
  });
}

// ── Screenshot upload helper ──

async function uploadToStorage(
  buffer: Buffer,
  projectId: string,
  url: string,
): Promise<string> {
  // Generate deterministic path from URL
  const urlSlug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 100);
  const path = `${projectId}/${urlSlug}.png`;

  return uploadScreenshot(buffer, path);
}
