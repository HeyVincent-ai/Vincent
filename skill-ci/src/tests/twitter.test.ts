import { describe, it, expect, beforeAll } from 'vitest';
import { runSkillAgent } from '../agent.js';
import { createClaimedDataSourceSecret } from '../auth.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const STYTCH_PROJECT_ID = process.env.STYTCH_PROJECT_ID!;
const STYTCH_SECRET = process.env.STYTCH_SECRET!;

const skillContent = readFileSync(
  resolve(import.meta.dirname, '../../../skills/twitter/SKILL.md'),
  'utf-8',
);

describe('Skill: twitter', () => {
  let claimedApiKey: string;

  beforeAll(async () => {
    const result = await createClaimedDataSourceSecret({
      baseUrl: BASE_URL,
      stytchProjectId: STYTCH_PROJECT_ID,
      stytchSecret: STYTCH_SECRET,
    });
    claimedApiKey = result.apiKey;
  });

  it('can search tweets and return real results', async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      task: `You already have a working DATA_SOURCES API key: ${claimedApiKey}

Use it to search tweets for "bitcoin" using the Twitter search endpoint documented in the skill.
Report the number of tweets found and the text of the first tweet.`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const calls = result.toolCalls.filter((c) => c.name === 'http_request');
    expect(calls.length).toBeGreaterThanOrEqual(1);

    // Verify a tweet search was made
    const searchCall = calls.find(
      (c) =>
        (c.args as { url: string }).url.includes(
          '/api/data-sources/twitter/search',
        ) &&
        (c.args as { method: string }).method === 'GET',
    );
    expect(searchCall).toBeDefined();

    const searchResult = searchCall!.result as {
      status: number;
      body: string;
    };
    expect(searchResult.status).toBe(200);

    // Verify real tweet data was returned
    const body = JSON.parse(searchResult.body);
    expect(body.data?.length).toBeGreaterThan(0);
  });
});
