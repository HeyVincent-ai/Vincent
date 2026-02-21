import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runSkillAgent } from '../agent.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const skillContent = readFileSync(
  resolve(import.meta.dirname, '../../../skills/polymarket/SKILL.md'),
  'utf-8'
);

describe('Skill: polymarket', () => {
  let stateDir: string;

  beforeAll(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'skill-ci-polymarket-'));
  });

  afterAll(() => {
    if (stateDir) {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('can create a polymarket wallet and browse markets', async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      stateDir,
      task: `Follow the skill instructions to:
1. Create a new Polymarket wallet (type: POLYMARKET_WALLET, memo: "CI test polymarket wallet")
2. Parse the JSON output to get the keyId
3. Use that keyId to search markets for "bitcoin" with limit 5

You MUST make both CLI calls. Report the keyId and the first market found.`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const calls = result.toolCalls.filter((c) => c.name === 'vincent_cli');
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a POLYMARKET_WALLET secret was created
    const createCall = calls.find((c) =>
      (c.args as { args: string }).args.includes('secret create')
    );
    expect(createCall).toBeDefined();

    const createResult = createCall!.result as { exitCode: number; output: string };
    expect(createResult.exitCode).toBe(0);
    const createBody = JSON.parse(createResult.output);
    expect(createBody.keyId).toBeDefined();

    // Verify markets were searched
    const marketCall = calls.find((c) =>
      (c.args as { args: string }).args.includes('polymarket markets')
    );
    expect(marketCall).toBeDefined();

    const marketResult = marketCall!.result as { exitCode: number; output: string };
    expect(marketResult.exitCode).toBe(0);
  });

  it('can check holdings endpoint', async () => {
    // Use a fresh state dir for isolation
    const holdingsStateDir = mkdtempSync(join(tmpdir(), 'skill-ci-pm-holdings-'));

    try {
      const result = await runSkillAgent({
        skillContent,
        baseUrl: BASE_URL,
        stateDir: holdingsStateDir,
        task: `Follow the skill instructions to:
1. Create a new Polymarket wallet (type: POLYMARKET_WALLET, memo: "CI test holdings check")
2. Parse the JSON output to get the keyId
3. Use that keyId to check your holdings

You MUST make both CLI calls. Report the keyId and the holdings response.`,
      });

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);

      const calls = result.toolCalls.filter((c) => c.name === 'vincent_cli');
      expect(calls.length).toBeGreaterThanOrEqual(2);

      // Verify a POLYMARKET_WALLET secret was created
      const createCall = calls.find((c) =>
        (c.args as { args: string }).args.includes('secret create')
      );
      expect(createCall).toBeDefined();

      const createResult = createCall!.result as { exitCode: number; output: string };
      expect(createResult.exitCode).toBe(0);

      // Verify holdings endpoint was called
      const holdingsCall = calls.find((c) =>
        (c.args as { args: string }).args.includes('polymarket holdings')
      );
      expect(holdingsCall).toBeDefined();

      const holdingsResult = holdingsCall!.result as { exitCode: number; output: string };
      expect(holdingsResult.exitCode).toBe(0);

      const holdingsBody = JSON.parse(holdingsResult.output);
      expect(holdingsBody.success).toBe(true);
      expect(holdingsBody.data.walletAddress).toBeTruthy();
      expect(Array.isArray(holdingsBody.data.holdings)).toBe(true);
      expect(holdingsBody.data.holdings.length).toBe(0);
    } finally {
      rmSync(holdingsStateDir, { recursive: true, force: true });
    }
  });
});
