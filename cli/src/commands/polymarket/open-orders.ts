import { parseArgs, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket open-orders', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'market', description: 'Filter by market condition ID' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const params: Record<string, string> = {};
  const market = getOptional(flags, 'market');
  if (market) params.market = market;

  const res = await vincentGet('/api/skills/polymarket/open-orders', apiKey, params);
  console.log(JSON.stringify(res, null, 2));
}
