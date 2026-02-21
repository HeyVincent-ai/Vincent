import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket withdraw', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'to', description: 'Recipient Ethereum address (0x...)', required: true },
      { name: 'amount', description: 'Amount in USDC (e.g. "100")', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const body = {
    to: getRequired(flags, 'to'),
    amount: getRequired(flags, 'amount'),
  };

  const res = await vincentPost('/api/skills/polymarket/withdraw', apiKey, body);
  console.log(JSON.stringify(res, null, 2));
}
