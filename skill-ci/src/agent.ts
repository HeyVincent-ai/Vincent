import { generateText, stepCountIs } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { httpRequestTool } from './tools.js';
import type { SkillTestResult, ToolCallRecord } from './types.js';

const DEFAULT_MODEL = 'google/gemini-3-flash-preview';
const DEFAULT_MAX_STEPS = 15;

export async function runSkillAgent(opts: {
  skillContent: string;
  task: string;
  baseUrl: string;
  model?: string;
  maxSteps?: number;
}): Promise<SkillTestResult> {
  const {
    skillContent,
    task,
    baseUrl,
    model = process.env.SKILL_CI_MODEL || DEFAULT_MODEL,
    maxSteps = DEFAULT_MAX_STEPS,
  } = opts;

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || process.env.CI_OPENROUTER_API_KEY,
  });

  const systemPrompt = `You are a testing agent verifying that a skill works correctly against a live API.

BASE URL: ${baseUrl}

The skill instructions use CLI commands (npx @vincentai/cli@latest ...) but you MUST translate them into HTTP requests using the http_request tool. Here is how to translate CLI commands to HTTP requests:

GENERAL PATTERN:
- "vincent secret create --type X --memo Y" → POST ${baseUrl}/api/secrets with body {"type": "X", "memo": "Y"}
- "vincent secret create --type X --memo Y --chain-id Z" → POST ${baseUrl}/api/secrets with body {"type": "X", "memo": "Y", "chainId": Z}
- "vincent brave web --q X" → GET ${baseUrl}/api/data-sources/brave/web?q=X
- "vincent brave news --q X" → GET ${baseUrl}/api/data-sources/brave/news?q=X
- "vincent twitter search --q X" → GET ${baseUrl}/api/data-sources/twitter/search?q=X
- "vincent twitter tweet --tweet-id X" → GET ${baseUrl}/api/data-sources/twitter/tweets/X
- "vincent twitter user --username X" → GET ${baseUrl}/api/data-sources/twitter/users/X
- "vincent twitter user-tweets --user-id X" → GET ${baseUrl}/api/data-sources/twitter/users/X/tweets
- "vincent wallet address" → GET ${baseUrl}/api/skills/evm-wallet/address
- "vincent wallet balances" → GET ${baseUrl}/api/skills/evm-wallet/balances
- "vincent wallet transfer --to X --amount Y" → POST ${baseUrl}/api/skills/evm-wallet/transfer with body {"to": "X", "amount": "Y"}
- "vincent polymarket balance" → GET ${baseUrl}/api/skills/polymarket/balance
- "vincent polymarket markets --query X" → GET ${baseUrl}/api/skills/polymarket/markets?query=X
- "vincent polymarket holdings" → GET ${baseUrl}/api/skills/polymarket/holdings
- "vincent polymarket bet --token-id X --side Y --amount Z" → POST ${baseUrl}/api/skills/polymarket/bet with body {"tokenId": "X", "side": "Y", "amount": Z}

AUTHENTICATION:
- When the CLI uses --key-id, the underlying HTTP request uses the header: Authorization: Bearer <API_KEY>
- If you are given an API key directly, use it in the Authorization header.
- When creating a secret (POST /api/secrets), no Authorization header is needed. The response contains the API key in data.apiKey.key.

Here are the skill instructions:

<skill>
${skillContent}
</skill>

Complete the task by making HTTP requests to the API. Be methodical — read the skill instructions carefully, then execute the required steps in order. When you receive a response, parse it and use the returned data (like API keys) in subsequent requests.`;

  try {
    const result = await generateText({
      model: openrouter(model),
      tools: { http_request: httpRequestTool },
      stopWhen: stepCountIs(maxSteps),
      system: systemPrompt,
      prompt: task,
      temperature: 0,
    });

    const toolCalls: ToolCallRecord[] = result.steps.flatMap((step) =>
      step.staticToolCalls.map((tc, i) => ({
        name: tc.toolName,
        args: tc.input as Record<string, unknown>,
        result: step.staticToolResults[i]?.output,
      }))
    );

    return {
      success: true,
      toolCalls,
      finalText: result.text,
      steps: result.steps.length,
    };
  } catch (error) {
    return {
      success: false,
      toolCalls: [],
      finalText: '',
      error: error instanceof Error ? error.message : String(error),
      steps: 0,
    };
  }
}
