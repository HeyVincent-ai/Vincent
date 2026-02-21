import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runSkillAgent } from '../agent.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const skillContent = readFileSync(
  resolve(import.meta.dirname, '../../../skills/wallet/SKILL.md'),
  'utf-8'
);

/** Safely get the args string from a tool call record */
function getArgs(c: { args: Record<string, unknown> }): string {
  const a = c.args?.args;
  return typeof a === 'string' ? a : '';
}

describe('Skill: wallet', () => {
  let stateDir: string;

  beforeAll(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'skill-ci-wallet-'));
  });

  afterAll(() => {
    if (stateDir) {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('can create a wallet and check its balance', async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      stateDir,
      task: `Follow the skill instructions. You MUST make exactly these CLI calls in order:

Step 1: Run vincent_cli with args: secret create --type EVM_WALLET --memo "CI test wallet" --chain-id 84532

Step 2: Parse the JSON output from Step 1 to find the "keyId" field.

Step 3: Run vincent_cli with args: wallet balances --key-id <KEYID> (replacing <KEYID> with the actual keyId from Step 1)

You MUST make both CLI calls. Report the wallet address and balance.`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const calls = result.toolCalls.filter((c) => c.name === 'vincent_cli');
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a secret was created
    const createCall = calls.find((c) => getArgs(c).includes('secret create'));
    expect(createCall).toBeDefined();

    const createResult = createCall!.result as { exitCode: number; output: string };
    expect(createResult.exitCode).toBe(0);
    const createBody = JSON.parse(createResult.output);
    expect(createBody.keyId).toBeDefined();

    // Verify balance was checked
    const balanceCall = calls.find(
      (c) => getArgs(c).includes('wallet balances') || getArgs(c).includes('wallet address')
    );
    expect(balanceCall).toBeDefined();

    const balanceResult = balanceCall!.result as { exitCode: number; output: string };
    expect(balanceResult.exitCode).toBe(0);
  });
});
