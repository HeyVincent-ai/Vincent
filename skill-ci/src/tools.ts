import { tool } from 'ai';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_PATH = resolve(import.meta.dirname, '../../cli/dist/index.js');

/** Split a command string into args, respecting quoted strings */
function shellSplit(str: string): string[] {
  const args: string[] = [];
  let current = '';
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < str.length && str[i] !== quote) {
        current += str[i];
        i++;
      }
      i++;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        args.push(current);
        current = '';
      }
      i++;
    } else {
      current += ch;
      i++;
    }
  }
  if (current) args.push(current);
  return args;
}

export function createVincentCliTool(opts: { baseUrl: string; stateDir: string }) {
  return tool({
    description:
      'Run a Vincent CLI command. Pass only the arguments after "vincent". For example: "brave web --key-id abc --q bitcoin" or "secret create --type EVM_WALLET --memo test".',
    parameters: z.object({
      args: z.string().describe('The CLI arguments after "vincent"'),
    }),
    execute: async ({ args }) => {
      if (!args || typeof args !== 'string') {
        return { exitCode: 1, output: 'Error: args must be a non-empty string' };
      }

      // Strip common prefixes if the model included them
      const cleanArgs = args
        .replace(/^npx\s+@vincentai\/cli@latest\s+/, '')
        .replace(/^vincent\s+/, '')
        .trim();

      if (!cleanArgs) {
        return {
          exitCode: 1,
          output: 'Error: no command provided. Usage: <group> <command> [options]',
        };
      }

      const cliArgs = shellSplit(cleanArgs);

      try {
        const output = execFileSync('node', [CLI_PATH, ...cliArgs], {
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
