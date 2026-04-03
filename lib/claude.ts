import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-4-20250514";

export async function chatWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
): Promise<Anthropic.Message> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    tools,
  });

  console.log(
    `[claude] tokens — input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}`,
  );

  return response;
}

export async function describeScreenshot(
  screenshot: Buffer,
  context: string,
  mediaType: "image/png" | "image/jpeg" = "image/jpeg",
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: screenshot.toString("base64"),
            },
          },
          { type: "text", text: context },
        ],
      },
    ],
  });

  console.log(
    `[claude] vision tokens — input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}`,
  );

  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function diagnoseTestFailure(
  testCode: string,
  errorMessage: string,
  screenshot: Buffer | null,
  previousAttempts: Array<{ error: string; fix: string }>,
): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = [];

  if (screenshot) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: screenshot.toString("base64"),
      },
    });
  }

  let prompt = `You are a Playwright test debugger for Stellar/Soroban dApps. A test failed.

## Test Code
\`\`\`typescript
${testCode}
\`\`\`

## Error
${errorMessage}

${previousAttempts.length > 0 ? `## Previous Fix Attempts (all failed)
${previousAttempts.map((a, i) => `Attempt ${i + 1}:\nError: ${a.error}\nFix applied: ${a.fix}`).join("\n\n")}` : ""}

## Instructions
1. CAREFULLY look at the screenshot — read every piece of text visible on screen
2. Compare what the screenshot shows with what the test code expects
3. Fix the test code to match what the page ACTUALLY looks like

## Selector rules
- Use page.getByRole(), page.getByText(), or page.locator(':has-text("...")') — these are resilient
- safeClick, safeFill, safeTextContent all accept both string selectors AND Locator objects
- To read a VALUE next to a LABEL, select the PARENT container: \`page.locator(':has-text("Balance")').first().textContent()\` then parseNumber()
- If a selector fails with "expected string, got object" — you're passing a Locator to a function that already wraps it. Just pass the string.

## Value reading rules
- parseNumber() handles any format: "$170,000.00 USDC" → 170000, "1.8%" → 1.8, "4,512" → 4512
- If you get 0 or NaN, your selector is grabbing the LABEL not the VALUE. Select the parent container instead.
- Read the FULL container text and let parseNumber extract the number

## Assertion rules — BE FLEXIBLE
- Use toBeGreaterThan(0) instead of exact values when just checking something exists
- Use toBeGreaterThanOrEqual() for balances that may change
- Use toBeCloseTo(expected, 0) for approximate comparisons
- NEVER assert exact values unless absolutely necessary
- If the screenshot shows the value is there, make the assertion match what you see

## Common failures
- "Received: 0" but screenshot shows value → wrong selector, grabbing label not value. USE \`readValueNear(page, "Label Text")\` from wait-utils — it automatically finds the numeric value near a label. Example: \`const balance = await readValueNear(page, "USDC Balance");\`
- "Received: NaN" → textContent returned something parseNumber can't handle, try a broader container
- Timeout → element hasn't loaded, add waitForPageReady or increase timeout
- "expected string, got object" → passing Locator where string expected, adjust
- Success message not found → REMOVE the assertion, just waitForPageReady and continue
- **Delta mismatch (expected ~50, got ~100 or ~0)** → The test probably stores a "before" value across separate test() blocks using process.env. On retry, the action runs AGAIN so the delta doubles. FIX: read before AND after values in the SAME test() block. And use a range check like \`expect(delta).toBeGreaterThan(40)\` not toBeCloseTo or toBe.
- **Blockchain values are never exact** — fees, rounding, and timing cause small differences. Use toBeGreaterThan() or range checks, never toBe() or toBeCloseTo() for on-chain values.

Return ONLY the complete fixed test code. No explanations, no markdown code fences, just the raw TypeScript code.`;

  content.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  console.log(
    `[claude] diagnose tokens — input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}`,
  );

  return response.content[0].type === "text" ? response.content[0].text : testCode;
}
