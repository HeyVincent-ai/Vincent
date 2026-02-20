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

IMPORTANT: All API endpoints in the skill instructions reference "https://heyvincent.ai". You MUST replace "https://heyvincent.ai" with "${baseUrl}" when making requests. For example:
- "https://heyvincent.ai/api/secrets" becomes "${baseUrl}/api/secrets"
- "https://heyvincent.ai/api/skills/evm-wallet/balances" becomes "${baseUrl}/api/skills/evm-wallet/balances"

Here are the skill instructions you must follow:

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
