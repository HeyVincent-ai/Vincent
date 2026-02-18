import { describe, it, expect } from 'vitest';
import { runSkillAgent } from '../agent.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const skillContent = readFileSync(
  resolve(import.meta.dirname, '../../../skills/polymarket/SKILL.md'),
  'utf-8'
);

describe('Skill: polymarket', () => {
  it('can create a polymarket wallet and browse markets', async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      task: `Follow the skill instructions to:
1. Create a new Polymarket wallet (type: POLYMARKET_WALLET, memo: "CI test polymarket wallet")
2. Use the returned API key to search for active markets about "bitcoin"
Report the API key, wallet address, and the first market found (question and prices).`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const calls = result.toolCalls.filter((c) => c.name === 'http_request');
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a POLYMARKET_WALLET secret was created
    const createCall = calls.find(
      (c) =>
        (c.args as { url: string }).url.includes('/api/secrets') &&
        (c.args as { method: string }).method === 'POST'
    );
    expect(createCall).toBeDefined();

    const createResult = createCall!.result as {
      status: number;
      body: string;
    };
    expect(createResult.status).toBe(201);
    const createBody = JSON.parse(createResult.body);
    expect(createBody.data.apiKey.key).toMatch(/^ssk_/);

    // Verify markets were searched/browsed
    const marketCall = calls.find((c) =>
      (c.args as { url: string }).url.includes('/api/skills/polymarket/market')
    );
    expect(marketCall).toBeDefined();

    const marketResult = marketCall!.result as { status: number };
    expect(marketResult.status).toBe(200);
  });

  it('can check holdings endpoint', async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      task: `Follow the skill instructions to:
1. Create a new Polymarket wallet (type: POLYMARKET_WALLET, memo: "CI test holdings check")
2. Use the returned API key to check your holdings using GET /api/skills/polymarket/holdings
Report the API key and the holdings response (it should be an empty array since the wallet has no positions yet).`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const calls = result.toolCalls.filter((c) => c.name === 'http_request');
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a POLYMARKET_WALLET secret was created
    const createCall = calls.find(
      (c) =>
        (c.args as { url: string }).url.includes('/api/secrets') &&
        (c.args as { method: string }).method === 'POST'
    );
    expect(createCall).toBeDefined();

    const createResult = createCall!.result as {
      status: number;
      body: string;
    };
    expect(createResult.status).toBe(201);
    const createBody = JSON.parse(createResult.body);
    expect(createBody.data.apiKey.key).toMatch(/^ssk_/);

    // Verify holdings endpoint was called
    const holdingsCall = calls.find((c) =>
      (c.args as { url: string }).url.includes('/api/skills/polymarket/holdings')
    );
    expect(holdingsCall).toBeDefined();

    const holdingsResult = holdingsCall!.result as {
      status: number;
      body: string;
    };
    expect(holdingsResult.status).toBe(200);

    const holdingsBody = JSON.parse(holdingsResult.body);
    expect(holdingsBody.success).toBe(true);
    expect(holdingsBody.data.walletAddress).toBeTruthy();
    expect(Array.isArray(holdingsBody.data.holdings)).toBe(true);
    // Empty holdings expected since wallet has no trades
    expect(holdingsBody.data.holdings.length).toBe(0);
  });
});
