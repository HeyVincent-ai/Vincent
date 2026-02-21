import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runSkillAgent } from '../agent.js';
import { createClaimedDataSourceSecret, deleteSecret, writeKeyToStore } from '../auth.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const STYTCH_PROJECT_ID = process.env.STYTCH_PROJECT_ID!;
const STYTCH_SECRET = process.env.STYTCH_SECRET!;

const skillContent = readFileSync(
  resolve(import.meta.dirname, '../../../skills/brave-search/SKILL.md'),
  'utf-8'
);

describe('Skill: brave-search', () => {
  let keyId: string;
  let secretId: string;
  let sessionToken: string;
  let stateDir: string;

  beforeAll(async () => {
    stateDir = mkdtempSync(join(tmpdir(), 'skill-ci-brave-'));

    const result = await createClaimedDataSourceSecret({
      baseUrl: BASE_URL,
      stytchProjectId: STYTCH_PROJECT_ID,
      stytchSecret: STYTCH_SECRET,
    });
    keyId = result.keyId;
    secretId = result.secretId;
    sessionToken = result.sessionToken;

    writeKeyToStore({
      stateDir,
      keyId,
      apiKey: result.apiKey,
      type: 'DATA_SOURCES',
      secretId,
      memo: 'CI test data sources',
    });
  });

  afterAll(async () => {
    if (secretId && sessionToken) {
      await deleteSecret({ baseUrl: BASE_URL, sessionToken, secretId });
    }
    if (stateDir) {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('can search the web and return real results', async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      stateDir,
      task: `You already have a DATA_SOURCES key stored with key ID: ${keyId}

Use it to search the web for "bitcoin price" using the Brave Search commands documented in the skill.
Report the number of results and the title of the first result.`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    // Verify a brave web search CLI call was made
    const getArgs = (c: { args: Record<string, unknown> }) => {
      const a = c.args?.args;
      return typeof a === 'string' ? a : '';
    };
    const searchCall = result.toolCalls.find(
      (c) => c.name === 'vincent_cli' && getArgs(c).includes('brave web')
    );
    expect(searchCall).toBeDefined();

    const searchResult = searchCall!.result as { exitCode: number; output: string };
    expect(searchResult.exitCode).toBe(0);

    // Verify real results were returned
    const body = JSON.parse(searchResult.output);
    expect(body.web?.results?.length).toBeGreaterThan(0);
  });
});
