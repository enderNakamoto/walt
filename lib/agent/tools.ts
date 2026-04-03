import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright";

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
    name: "navigate_and_screenshot",
    description:
      "Navigate to a URL in the exploration browser and take a screenshot. Use to verify current state of a page.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to",
        },
      },
      required: ["url"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "navigate_and_screenshot":
      return navigateAndScreenshot(input.url as string);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function navigateAndScreenshot(
  url: string,
): Promise<{ screenshot: string }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const buf = await page.screenshot({ type: "jpeg", quality: 60 });
    return {
      screenshot: `data:image/jpeg;base64,${buf.toString("base64")}`,
    };
  } finally {
    await browser.close();
  }
}
