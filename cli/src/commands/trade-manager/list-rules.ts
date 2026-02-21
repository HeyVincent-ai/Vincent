import { parseArgs, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet, getTradeManagerBaseUrl } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('trade-manager list-rules', [
      { name: 'key-id', description: 'Polymarket API key ID' },
      { name: 'status', description: 'Filter by status (ACTIVE, TRIGGERED, CANCELED, FAILED)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const params: Record<string, string> = {};
  const status = getOptional(flags, 'status');
  if (status) params.status = status;

  const res = await vincentGet('/api/rules', apiKey, params, { baseUrl: getTradeManagerBaseUrl() });
  console.log(JSON.stringify(res, null, 2));
}
