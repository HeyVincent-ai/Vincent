import { parseArgs, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('trade-manager status', [{ name: 'key-id', description: 'Polymarket API key ID' }]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const res = await vincentGet('/api/skills/polymarket/rules/status', apiKey);
  console.log(JSON.stringify(res, null, 2));
}
