import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_PATH = resolve(import.meta.dirname, '../../cli/dist/index.js');

export function createVincentCliTool(opts: { baseUrl: string; stateDir: string }) {
  return tool({
    description:
      'Run a Vincent CLI command. Pass only the arguments after "vincent". For example: "brave web --key-id abc --q bitcoin" or "secret create --type EVM_WALLET --memo test".',
    parameters: z.object({
      args: z.string().describe('The CLI arguments after "vincent"'),
    }),
    execute: async ({ args }) => {
      try {
        const output = execSync(`node ${CLI_PATH} ${args}`, {
          encoding: 'utf-8',
          timeout: 30000,
          env: {
            ...process.env,
            VINCENT_BASE_URL: opts.baseUrl,
            OPENCLAW_STATE_DIR: opts.stateDir,
          },
        });
        return { exitCode: 0, output: output.trim() };
      } catch (err: unknown) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        return {
          exitCode: e.status || 1,
          output: ((e.stdout || '') + (e.stderr || '')).trim(),
        };
      }
    },
  });
}
