import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function chatWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
): Promise<Anthropic.Message> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
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
    model: "claude-sonnet-4-20250514",
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
