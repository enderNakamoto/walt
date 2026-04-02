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

const EXPLORATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PAGES = 15;

export async function explore(
  dappUrl: string,
  walletSecret: string | null,
  sse: SSEWriter,
  projectId: string,
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<void> {
  let browser: Browser | null = null;

  const timeout = setTimeout(() => {
    console.warn("[explore] Timed out after 5 minutes");
    sse.send({ type: "error", message: "Exploration timed out after 5 minutes" });
    browser?.close();
  }, EXPLORATION_TIMEOUT_MS);

  signal?.addEventListener("abort", () => {
    browser?.close();
  });

  try {
    browser = await chromium.launch();
    const page = await browser.newPage();

    if (walletSecret) {
      sse.send({ type: "status", message: "Installing wallet mock..." });
      await installMockStellarWallet({ page, secretKey: walletSecret });
    }

    const visited = new Set<string>();
    const toVisit = [dappUrl];
    const origin = new URL(dappUrl).origin;
    const collectedSnapshots: ExplorationData["snapshots"] = [];

    // Load previously explored pages — replay them to UI unless forceRefresh
    const existingSnapshots = forceRefresh ? [] : await getSnapshots(projectId);
    if (existingSnapshots.length > 0) {
      console.log(`[explore] Resuming — ${existingSnapshots.length} pages already explored`);
      sse.send({ type: "status", message: `Loading ${existingSnapshots.length} previously explored pages...` });

      for (const snap of existingSnapshots) {
        visited.add(snap.url);

        // Send saved screenshot to UI so it displays
        if (snap.screenshot_path) {
          sse.send({ type: "screenshot", url: snap.url, image: snap.screenshot_path });
        }

        if (snap.dom_summary && snap.selectors) {
          collectedSnapshots.push({
            url: snap.url,
            dom_summary: snap.dom_summary,
            selectors: snap.selectors,
          });
          sse.send({
            type: "page_summary",
            url: snap.url,
            summary: snap.dom_summary,
            selectors: snap.selectors,
          });
        }
      }

      // Navigate to root to discover any NEW links not yet explored
      if (visited.has(dappUrl)) {
        sse.send({ type: "status", message: "Checking for new pages..." });
        try {
          await page.goto(dappUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
          await page.waitForTimeout(3000);
          const links = await page.$$eval("a[href]", (els) =>
            els.map((a) => (a as HTMLAnchorElement).href),
          );
          for (const link of links) {
            const normalized = link.split("#")[0].split("?")[0];
            if (normalized.startsWith(origin) && !visited.has(normalized)) {
              toVisit.push(normalized);
              sse.send({ type: "page_discovered", url: normalized });
            }
          }
        } catch {
          // ignore
        }
      }

      // If no new pages to visit, we're done
      if (toVisit.length === 0) {
        sse.send({ type: "done", totalPages: visited.size });
        return;
      }
    }

    while (toVisit.length > 0) {
      if (signal?.aborted) break;
      if (visited.size >= MAX_PAGES) {
        sse.send({
          type: "status",
          message: `Reached max ${MAX_PAGES} pages, stopping exploration.`,
        });
        break;
      }

      const url = toVisit.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      // Navigate — use domcontentloaded + short wait instead of networkidle
      // SPAs with persistent connections hang on networkidle
      sse.send({
        type: "status",
        message: `Navigating to ${url}... (page ${visited.size}/${MAX_PAGES})`,
      });
      console.log(`[explore] Navigating to ${url}`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        // Give the SPA time to render
        await page.waitForTimeout(3000);
      } catch (navErr) {
        console.warn(`[explore] Failed to load ${url}:`, navErr);
        sse.send({ type: "status", message: `Failed to load ${url}, skipping...` });
        continue;
      }

      // Screenshot — stream JPEG to browser immediately
      console.log(`[explore] Taking screenshot of ${url}`);
      const screenshotBuf = await page.screenshot({ type: "jpeg", quality: 60 });
      sse.send({
        type: "screenshot",
        url,
        image: `data:image/jpeg;base64,${screenshotBuf.toString("base64")}`,
      });

      // Extract interactive elements from DOM
      const selectors = await extractSelectors(page);

      // Ask Claude to describe the page (vision)
      console.log(`[explore] Describing ${url} with Claude...`);
      let summary: string;
      try {
        summary = await describeScreenshot(
          screenshotBuf,
          `Describe this page of a Stellar dApp. URL: ${url}\n`
            + `Interactive elements found: ${JSON.stringify(selectors)}`,
        );
      } catch (claudeErr) {
        console.warn(`[explore] Claude vision failed for ${url}:`, claudeErr);
        summary = "Failed to describe page";
      }

      sse.send({ type: "page_summary", url, summary, selectors });
      console.log(`[explore] Done with ${url}: ${summary.slice(0, 80)}...`);

      // Upload to Supabase Storage + save snapshot (non-blocking)
      try {
        const pngBuf = await page.screenshot({ type: "png" });
        const storagePath = await uploadToStorage(pngBuf, projectId, url);
        await upsertSnapshot({
          project_id: projectId,
          url,
          screenshot_path: storagePath,
          dom_summary: summary,
          selectors,
        });
      } catch (dbErr) {
        console.warn(`[explore] Failed to persist snapshot for ${url}:`, dbErr);
      }

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
    try {
      await updateProjectExplorationData(projectId, explorationData);
    } catch (dbErr) {
      console.warn("[explore] Failed to cache exploration data:", dbErr);
    }

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
  const urlSlug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 100);
  const path = `${projectId}/${urlSlug}.png`;

  return uploadScreenshot(buffer, path);
}
