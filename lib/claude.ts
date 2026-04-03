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
1. Look at the screenshot to see what the page actually shows
2. Compare the selectors/assertions in the test with what's visible on screen
3. Fix the test code to match reality

Common issues:
- Selector text doesn't match actual page text (check exact wording, whitespace, formatting)
- Element hasn't loaded yet (use waitForPageReady, safeClick, safeFill from wait-utils)
- Value format mismatch (use parseNumber() for numeric comparisons)
- Transaction still pending (use waitForTransaction with proper successIndicator)
- React re-render between action and assertion (use waitForValueChange)

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
