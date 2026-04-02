/**
 * Claude API validation script
 * Run: npx tsx scripts/test-claude.ts
 *
 * Requires ANTHROPIC_API_KEY in .env.local or environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// Dynamic import so dotenv runs before Anthropic client is instantiated
async function main() {
  console.log("=== Claude API Validation ===");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set. Add it to .env.local");
    process.exit(1);
  }
  console.log("API key found:", process.env.ANTHROPIC_API_KEY.slice(0, 12) + "...");

  const { chatWithTools, describeScreenshot } = await import("../lib/claude");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");

  // --- Test 1: chatWithTools ---
  try {
    console.log("\n--- Test 1: chatWithTools ---");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any[] = [
      {
        name: "get_weather",
        description: "Get the current weather for a location.",
        input_schema: {
          type: "object" as const,
          properties: {
            location: { type: "string", description: "City name" },
          },
          required: ["location"],
        },
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: "user", content: "What's the weather in San Francisco?" },
    ];

    const response = await chatWithTools(
      "You are a helpful assistant. Use the get_weather tool to answer weather questions.",
      messages,
      tools,
    );

    console.log("Stop reason:", response.stop_reason);
    console.log("Content blocks:", response.content.length);

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      console.log("Tool called:", toolUse.name);
      console.log("Tool input:", JSON.stringify(toolUse.input));
      console.log("PASS: chatWithTools triggered tool call");
    } else {
      console.log("WARN: No tool call — Claude responded with text only");
      const text = response.content.find((b) => b.type === "text");
      if (text && text.type === "text") console.log("Text:", text.text.slice(0, 100));
    }
  } catch (err) {
    console.error("FAIL: chatWithTools —", err);
  }

  // --- Test 2: describeScreenshot ---
  try {
    console.log("\n--- Test 2: describeScreenshot ---");

    // Generate a small but valid PNG using canvas-like approach
    // Use Playwright to create a real screenshot for testing
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 200, height: 100 } });
    await page.setContent("<h1 style='color:blue'>Hello WALT</h1>");
    const screenshotBuf = await page.screenshot({ type: "png" });
    await browser.close();

    const description = await describeScreenshot(
      screenshotBuf,
      "Describe what you see in this image. Keep it very brief.",
    );

    console.log("Description:", description.slice(0, 200));
    console.log("PASS: describeScreenshot returned text");
  } catch (err) {
    console.error("FAIL: describeScreenshot —", err);
  }

  console.log("\n=== Done ===");
}

main();
