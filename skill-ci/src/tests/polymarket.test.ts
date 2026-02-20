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
      task: `Follow the skill instructions. You MUST make exactly these HTTP requests in order:

Step 1: POST to /api/secrets with body {"type": "POLYMARKET_WALLET", "memo": "CI test polymarket wallet"} to create a wallet.

Step 2: Parse the JSON response from Step 1 to extract the API key from data.apiKey.key. Then make a GET request to /api/skills/polymarket/markets?query=bitcoin&limit=5 with the header "Authorization: Bearer <API_KEY>" (replacing <API_KEY> with the actual key from Step 1).

You MUST make both HTTP requests. Report the API key, wallet address, and the first market found.`,
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
      task: `Follow the skill instructions. You MUST make exactly these HTTP requests in order:

Step 1: POST to /api/secrets with body {"type": "POLYMARKET_WALLET", "memo": "CI test holdings check"} to create a wallet.

Step 2: Parse the JSON response from Step 1 to extract the API key from data.apiKey.key. Then make a GET request to /api/skills/polymarket/holdings with the header "Authorization: Bearer <API_KEY>" (replacing <API_KEY> with the actual key from Step 1).

You MUST make both HTTP requests. Report the API key and the holdings response.`,
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
