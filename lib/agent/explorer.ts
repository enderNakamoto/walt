import { chromium, type Page, type Browser } from "playwright";
import { installMockStellarWallet } from "stellar-wallet-mock";
import { describeScreenshot } from "../claude";
import {
  upsertSnapshot,
  updateProjectExplorationData,
  uploadScreenshot,
  getSnapshots,
} from "../supabase";
import type { SSEWriter, PageSelectors, PageData, ExplorationData } from "../types";

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

      // Extract rich page data from DOM + accessibility tree
      const pageData = await extractPageData(page, url);

      // Build legacy selectors for backward compat with frontend
      const selectors = pageDataToSelectors(pageData);

      // Ask Claude to describe the page (vision) with richer context
      console.log(`[explore] Describing ${url} with Claude...`);
      let summary: string;
      try {
        const elementSummary = [
          `Buttons: ${pageData.elements.buttons.map((b) => b.text || b.ariaLabel || b.cssSelector).join(", ")}`,
          `Inputs: ${pageData.elements.inputs.map((i) => i.label || i.placeholder || i.cssSelector).join(", ")}`,
          `Headings: ${pageData.visibleText.headings.join(", ")}`,
          `Loading: ${pageData.pageState.hasLoadingIndicators ? "yes" : "no"}`,
        ].join("\n");
        summary = await describeScreenshot(
          screenshotBuf,
          `Describe this page of a Stellar dApp. URL: ${url}\nTitle: ${pageData.title}\n${elementSummary}`,
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
          selectors: pageData as unknown as PageSelectors,
        });
      } catch (dbErr) {
        console.warn(`[explore] Failed to persist snapshot for ${url}:`, dbErr);
      }

      collectedSnapshots.push({ url, dom_summary: summary, selectors, pageData });

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

// ── Rich page data extraction (Phase 12) ──

export async function extractPageData(page: Page, url: string): Promise<PageData> {
  const domData = await page.evaluate(() => {
    // Helper: build a unique CSS selector for an element
    function uniqueSelector(el: Element): string {
      // Prefer data-testid
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;

      // Prefer aria-label
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `[aria-label="${ariaLabel}"]`;

      // Prefer id
      if (el.id) return `#${CSS.escape(el.id)}`;

      // Build a path-based selector
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body) {
        let sel = current.tagName.toLowerCase();
        if (current.id) {
          sel = `#${CSS.escape(current.id)}`;
          parts.unshift(sel);
          break;
        }
        const parentEl: Element | null = current.parentElement;
        if (parentEl) {
          const currentTag = current.tagName;
          const siblings = Array.from(parentEl.children).filter(
            (c: Element) => c.tagName === currentTag,
          );
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            sel += `:nth-of-type(${idx})`;
          }
        }
        parts.unshift(sel);
        current = parentEl;
      }
      return parts.join(" > ");
    }

    // Helper: get nearby text from parent and siblings
    function getNearbyText(el: Element): string[] {
      const texts: string[] = [];
      const parent = el.parentElement;
      if (parent) {
        // Check previous sibling text
        const prev = el.previousElementSibling;
        if (prev) {
          const t = prev.textContent?.trim()?.slice(0, 80);
          if (t) texts.push(t);
        }
        // Check parent text (excluding child element text)
        for (const node of Array.from(parent.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const t = node.textContent?.trim()?.slice(0, 80);
            if (t) texts.push(t);
          }
        }
      }
      return texts.slice(0, 3);
    }

    // Helper: check element visibility
    function isElementVisible(el: Element): boolean {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    // Helper: find the nearest section heading above an element
    function findParentSection(el: Element): string | null {
      let current: Element | null = el;
      while (current) {
        // Check previous siblings for headings
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (/^H[1-6]$/.test(sibling.tagName)) {
            return sibling.textContent?.trim()?.slice(0, 100) || null;
          }
          sibling = sibling.previousElementSibling;
        }
        current = current.parentElement;
      }
      return null;
    }

    // Extract visible text
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .map((el) => el.textContent?.trim()?.slice(0, 150) || "")
      .filter(Boolean);

    const labels = Array.from(document.querySelectorAll("label, [aria-label]"))
      .map((el) => el.getAttribute("aria-label") || el.textContent?.trim()?.slice(0, 100) || "")
      .filter(Boolean);

    // Values: look for displayed amounts, balances, stats
    const values = Array.from(
      document.querySelectorAll("[data-value], .balance, .amount, .value, .stat, output, [role='status']"),
    )
      .map((el) => el.textContent?.trim()?.slice(0, 100) || "")
      .filter(Boolean)
      .slice(0, 20);

    // Extract buttons
    const buttons = Array.from(
      document.querySelectorAll("button, [role='button'], input[type='submit']"),
    ).map((el) => ({
      text: el.textContent?.trim()?.slice(0, 100) || "",
      testId: el.getAttribute("data-testid"),
      ariaLabel: el.getAttribute("aria-label"),
      cssSelector: uniqueSelector(el),
      nearbyText: getNearbyText(el),
      isDisabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true",
      isVisible: isElementVisible(el),
    }));

    // Extract inputs
    const inputs = Array.from(
      document.querySelectorAll("input, textarea, select"),
    ).map((el) => {
      const inputEl = el as HTMLInputElement;
      // Find associated label
      let label: string | null = null;
      if (inputEl.id) {
        const labelEl = document.querySelector(`label[for="${inputEl.id}"]`);
        if (labelEl) label = labelEl.textContent?.trim()?.slice(0, 100) || null;
      }
      if (!label) {
        label = inputEl.getAttribute("aria-label") || null;
      }
      if (!label) {
        // Check if wrapped in a label
        const parentLabel = inputEl.closest("label");
        if (parentLabel) label = parentLabel.textContent?.trim()?.slice(0, 100) || null;
      }

      return {
        label,
        placeholder: inputEl.getAttribute("placeholder"),
        type: inputEl.getAttribute("type"),
        testId: inputEl.getAttribute("data-testid"),
        cssSelector: uniqueSelector(el),
        currentValue: inputEl.value || "",
        parentSection: findParentSection(el),
      };
    });

    // Extract links
    const currentOrigin = window.location.origin;
    const links = Array.from(document.querySelectorAll("a[href]")).map((el) => {
      const anchor = el as HTMLAnchorElement;
      return {
        text: el.textContent?.trim()?.slice(0, 100) || "",
        href: anchor.href,
        isExternal: !anchor.href.startsWith(currentOrigin),
      };
    });

    // Detect loading indicators
    const hasLoadingIndicators =
      document.querySelectorAll(
        ".spinner, .loading, .skeleton, [aria-busy='true'], " +
        "[class*='animate-spin'], [class*='animate-pulse'], " +
        "[class*='shimmer'], [role='progressbar']",
      ).length > 0;

    return {
      title: document.title,
      visibleText: { headings, labels, values },
      elements: { buttons, inputs, links },
      pageState: { hasLoadingIndicators },
    };
  });

  // Get accessibility snapshot from Playwright (ariaSnapshot returns YAML-like string)
  let accessibilitySnapshot: PageData["accessibilitySnapshot"] = [];
  try {
    const snapshotStr = await page.ariaSnapshot({ depth: 3 });
    if (snapshotStr) {
      accessibilitySnapshot = parseAriaSnapshot(snapshotStr);
    }
  } catch (a11yErr) {
    console.warn(`[explore] Accessibility snapshot failed for ${url}:`, a11yErr);
  }

  // Check network idle state
  let isNetworkIdle = true;
  try {
    await page.waitForLoadState("networkidle", { timeout: 2000 });
  } catch {
    isNetworkIdle = false;
  }

  return {
    url,
    title: domData.title,
    visibleText: domData.visibleText,
    elements: domData.elements,
    accessibilitySnapshot,
    pageState: {
      hasLoadingIndicators: domData.pageState.hasLoadingIndicators,
      isNetworkIdle,
    },
  };
}

// ── Parse Playwright ariaSnapshot YAML-like string into structured nodes ──
// Format: lines like "  - button \"Submit\"", "  - heading \"Title\" [level=2]", "  - textbox \"Email\" [disabled]"

function parseAriaSnapshot(snapshot: string): PageData["accessibilitySnapshot"] {
  const keepRoles = new Set([
    "button", "link", "textbox", "combobox", "checkbox", "radio",
    "slider", "spinbutton", "switch", "tab", "menuitem",
    "heading", "dialog", "alert", "status", "navigation", "main",
  ]);

  const result: PageData["accessibilitySnapshot"] = [];
  const lines = snapshot.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;

    // Parse: "- role \"name\" [attributes]" or "- role \"name\": value"
    const match = trimmed.match(/^- (\w+)(?:\s+"([^"]*)")?(.*)$/);
    if (!match) continue;

    const role = match[1];
    const name = match[2] || "";
    const rest = match[3]?.trim() || "";

    if (!keepRoles.has(role)) continue;

    const node: PageData["accessibilitySnapshot"][number] = { role, name };

    // Parse level from [level=N]
    const levelMatch = rest.match(/\[level=(\d+)\]/);
    if (levelMatch) node.level = parseInt(levelMatch[1], 10);

    // Parse disabled
    if (rest.includes("[disabled]")) node.disabled = true;

    // Parse value after colon
    const valueMatch = rest.match(/:\s*"?([^"]*)"?$/);
    if (valueMatch && valueMatch[1]) node.value = valueMatch[1].trim();

    result.push(node);
  }

  return result;
}

// ── Convert PageData to legacy PageSelectors for backward compat ──

function pageDataToSelectors(pageData: PageData): PageSelectors {
  return {
    buttons: pageData.elements.buttons.map((b) => ({
      text: b.text || null,
      testId: b.testId,
      selector: b.cssSelector || null,
    })),
    inputs: pageData.elements.inputs.map((i) => ({
      label: i.label || i.placeholder || null,
      testId: i.testId,
      type: i.type,
      selector: i.cssSelector || null,
    })),
    links: pageData.elements.links.map((l) => ({
      text: l.text || null,
      href: l.href,
    })),
  };
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
