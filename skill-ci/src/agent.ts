import { generateText, stepCountIs } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createVincentCliTool } from './tools.js';
import type { SkillTestResult, ToolCallRecord } from './types.js';

const DEFAULT_MODEL = 'google/gemini-3-flash-preview';
const DEFAULT_MAX_STEPS = 15;

export async function runSkillAgent(opts: {
  skillContent: string;
  task: string;
  baseUrl: string;
  stateDir: string;
  model?: string;
  maxSteps?: number;
}): Promise<SkillTestResult> {
  const {
    skillContent,
    task,
    baseUrl,
    stateDir,
    model = process.env.SKILL_CI_MODEL || DEFAULT_MODEL,
    maxSteps = DEFAULT_MAX_STEPS,
  } = opts;

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || process.env.CI_OPENROUTER_API_KEY,
  });

  const vincentCli = createVincentCliTool({ baseUrl, stateDir });

  const systemPrompt = `You are a testing agent verifying that a skill works correctly.

You have access to the "vincent_cli" tool which runs Vincent CLI commands. Use it to execute commands as documented in the skill instructions.

CRITICAL: You MUST call the vincent_cli tool for EVERY command. Never describe what you would do — always actually call the tool. If the task requires multiple CLI calls, you MUST make ALL of them. Do not stop after the first call. After each tool call, immediately proceed to the next required call.

IMPORTANT: The skill instructions show commands like "npx @vincentai/cli@latest <args>". When using the vincent_cli tool, pass ONLY the arguments after "vincent". For example:
- Skill says: npx @vincentai/cli@latest brave web --q "bitcoin"
  You call vincent_cli with args: brave web --q bitcoin
- Skill says: npx @vincentai/cli@latest secret create --type EVM_WALLET --memo "test"
  You call vincent_cli with args: secret create --type EVM_WALLET --memo test

The CLI outputs JSON. Parse the JSON output to extract data (like keyId) for subsequent commands.

When the skill says to use --key-id <KEY_ID>, use the keyId returned from a previous "secret create" command, or a key ID provided in your task instructions.

If a CLI call returns an error, still proceed with the remaining steps. Do not stop early.

Here are the skill instructions:

<skill>
${skillContent}
</skill>

Complete the task using the vincent_cli tool. Be methodical — read the skill instructions carefully, then execute the required steps in order. You MUST make ALL required tool calls.`;

  try {
    const result = await generateText({
      model: openrouter(model),
      tools: { vincent_cli: vincentCli },
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
