import { parseArgs, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet, getTradeManagerBaseUrl } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('trade-manager events', [
      { name: 'key-id', description: 'Polymarket API key ID' },
      { name: 'rule-id', description: 'Filter by rule ID' },
      { name: 'limit', description: 'Max results (1-1000, default: 100)' },
      { name: 'offset', description: 'Pagination offset' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const params: Record<string, string> = {};
  const ruleId = getOptional(flags, 'rule-id');
  if (ruleId) params.ruleId = ruleId;
  const limit = getOptional(flags, 'limit');
  if (limit) params.limit = limit;
  const offset = getOptional(flags, 'offset');
  if (offset) params.offset = offset;

  const res = await vincentGet('/api/events', apiKey, params, {
    baseUrl: getTradeManagerBaseUrl(),
  });
  console.log(JSON.stringify(res, null, 2));
}
