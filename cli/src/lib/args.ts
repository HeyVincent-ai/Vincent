import type { ArgDef } from './types.js';

export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
        i++;
      } else {
        flags[key] = next;
        i += 2;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { flags, positional };
}

export function getRequired(flags: Record<string, string | boolean>, name: string): string {
  const val = flags[name];
  if (typeof val !== 'string') {
    console.error(`Missing required option: --${name}`);
    process.exit(1);
  }
  return val;
}

export function getOptional(
  flags: Record<string, string | boolean>,
  name: string
): string | undefined {
  const val = flags[name];
  if (typeof val !== 'string') return undefined;
  return val;
}

export function getNumber(
  flags: Record<string, string | boolean>,
  name: string
): number | undefined {
  const val = getOptional(flags, name);
  if (val === undefined) return undefined;
  const n = Number(val);
  if (isNaN(n)) {
    console.error(`Invalid number for --${name}: ${val}`);
    process.exit(1);
  }
  return n;
}

export function getRequiredNumber(flags: Record<string, string | boolean>, name: string): number {
  const val = getRequired(flags, name);
  const n = Number(val);
  if (isNaN(n)) {
    console.error(`Invalid number for --${name}: ${val}`);
    process.exit(1);
  }
  return n;
}

export function hasFlag(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true || flags[name] !== undefined;
}

export function showHelp(command: string, args: ArgDef[]): void {
  console.log(`Usage: vincent ${command} [options]\n`);
  console.log('Options:');
  for (const arg of args) {
    const req = arg.required ? ' (required)' : '';
    console.log(`  --${arg.name.padEnd(20)} ${arg.description}${req}`);
  }
  console.log(`  --${'help'.padEnd(20)} Show this help message`);
}
