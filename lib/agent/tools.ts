import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "playwright";
import { extractPageData } from "./explorer";
import type { PageData } from "../types";

export const tools: Anthropic.Tool[] = [
  {
    name: "ask_question",
    description:
      "Ask the user a clarifying question before generating the test. Use this when you need to know: which page, what values to input, what to assert, or edge cases.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "generate_test",
    description:
      "Generate the final Playwright test code. Only call this when you have enough information from the user and exploration data.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description:
            "Complete Playwright test code using stellar-wallet-mock",
        },
        name: {
          type: "string",
          description: "A descriptive name summarizing the test scenario, e.g. 'Mint USDC and Deposit to Vault' or 'Faucet Balance Check'. Do NOT use generic names like 'Test Agent'.",
        },
        description: {
          type: "string",
          description: "A detailed plain-english description of what the test does step by step, e.g. 'Navigates to faucet, mints 10k USDC, then deposits 500 to vault and verifies TVL increases'",
        },
      },
      required: ["code", "name", "description"],
    },
  },
  {
    name: "inspect_page",
    description:
      "Navigate to a page and inspect its current state. Returns a screenshot and full DOM data including all visible text, interactive elements with exact selectors, and page state. ALWAYS use this before generating test code to verify what the page actually shows. The browser has the wallet mock installed so you see the same UI the test will see.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "Full URL to inspect",
        },
        waitForSelector: {
          type: "string",
          description: "Optional CSS selector to wait for before inspecting (e.g. 'h1', '.vault-stats')",
        },
      },
      required: ["url"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  page?: Page,
): Promise<unknown> {
  switch (name) {
    case "inspect_page":
      return inspectPage(
        input.url as string,
        input.waitForSelector as string | undefined,
        page!,
      );
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function inspectPage(
  url: string,
  waitForSelector: string | undefined,
  page: Page,
): Promise<{ screenshot: string; pageData: PageData }> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 10_000 });
  }

  // Give the SPA time to render
  await page.waitForTimeout(2000);

  const buf = await page.screenshot({ type: "jpeg", quality: 60 });
  const screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`;

  const pageData = await extractPageData(page, url);

  return { screenshot, pageData };
}
