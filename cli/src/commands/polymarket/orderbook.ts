import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket orderbook', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'token-id', description: 'Outcome token ID', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const tokenId = getRequired(flags, 'token-id');
  const res = await vincentGet(`/api/skills/polymarket/orderbook/${tokenId}`, apiKey);
  console.log(JSON.stringify(res, null, 2));
}
