import { parseArgs, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentDelete } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket cancel-all', [{ name: 'key-id', description: 'API key ID' }]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const res = await vincentDelete('/api/skills/polymarket/orders', apiKey);
  console.log(JSON.stringify(res, null, 2));
}
