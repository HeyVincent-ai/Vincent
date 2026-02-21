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
      task: `Follow the skill instructions to:
1. Create a new EVM wallet (type: EVM_WALLET, chain-id: 84532, memo: "CI test wallet")
2. Parse the JSON output to get the keyId
3. Use that keyId to check the wallet balances

You MUST make both CLI calls. Report the wallet address and balance.`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const calls = result.toolCalls.filter((c) => c.name === 'vincent_cli');
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a secret was created
    const createCall = calls.find((c) =>
      (c.args as { args: string }).args.includes('secret create')
    );
    expect(createCall).toBeDefined();

    const createResult = createCall!.result as { exitCode: number; output: string };
    expect(createResult.exitCode).toBe(0);
    const createBody = JSON.parse(createResult.output);
    expect(createBody.keyId).toBeDefined();

    // Verify balance was checked
    const balanceCall = calls.find(
      (c) =>
        (c.args as { args: string }).args.includes('wallet balances') ||
        (c.args as { args: string }).args.includes('wallet address')
    );
    expect(balanceCall).toBeDefined();

    const balanceResult = balanceCall!.result as { exitCode: number; output: string };
    expect(balanceResult.exitCode).toBe(0);
  });
});
