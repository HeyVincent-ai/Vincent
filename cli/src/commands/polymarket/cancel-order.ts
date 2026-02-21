import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentDelete } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket cancel-order', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'order-id', description: 'Order ID to cancel', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const orderId = getRequired(flags, 'order-id');
  const res = await vincentDelete(`/api/skills/polymarket/orders/${orderId}`, apiKey);
  console.log(JSON.stringify(res, null, 2));
}
