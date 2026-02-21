import { parseArgs, hasFlag, showHelp } from '../../lib/args.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('trade-manager health', []);
    return;
  }

  const res = await vincentGet('/health', null);
  console.log(JSON.stringify(res, null, 2));
}
