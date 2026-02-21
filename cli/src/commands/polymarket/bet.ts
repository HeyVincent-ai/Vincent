import {
  parseArgs,
  getRequired,
  getRequiredNumber,
  getNumber,
  hasFlag,
  showHelp,
} from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket bet', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'token-id', description: 'Outcome token ID', required: true },
      { name: 'side', description: 'BUY or SELL', required: true },
      { name: 'amount', description: 'USD amount (BUY) or shares (SELL)', required: true },
      { name: 'price', description: 'Limit price 0.01-0.99 (omit for market order)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const body: Record<string, unknown> = {
    tokenId: getRequired(flags, 'token-id'),
    side: getRequired(flags, 'side'),
    amount: getRequiredNumber(flags, 'amount'),
  };
  const price = getNumber(flags, 'price');
  if (price !== undefined) body.price = price;

  const res = await vincentPost('/api/skills/polymarket/bet', apiKey, body);
  console.log(JSON.stringify(res, null, 2));
}
