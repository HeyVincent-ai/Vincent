import { describe, it, expect } from 'vitest';
import { runSkillAgent } from '../agent.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const skillContent = readFileSync(
  resolve(import.meta.dirname, '../../../skills/twitter/SKILL.md'),
  'utf-8'
);

describe('Skill: twitter', () => {
  it('can create a data sources secret and attempt a tweet search', async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      task: `Follow the skill instructions to:
1. Create a new DATA_SOURCES secret (type: DATA_SOURCES, memo: "CI test data sources")
2. Use the returned API key to search tweets for "bitcoin"
Report the API key, and the search result or error message.`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const calls = result.toolCalls.filter((c) => c.name === 'http_request');
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a DATA_SOURCES secret was created
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

    // Verify a tweet search was attempted
    const searchCall = calls.find(
      (c) =>
        (c.args as { url: string }).url.includes('/api/data-sources/twitter/') &&
        (c.args as { method: string }).method === 'GET'
    );
    expect(searchCall).toBeDefined();

    // The search may fail with a credit/claim error since the secret is unclaimed,
    // but the agent should have made the attempt
    const searchResult = searchCall!.result as { status: number };
    expect([200, 402, 403]).toContain(searchResult.status);
  });
});
