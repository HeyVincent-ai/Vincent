import { parseArgs, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket markets', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'query', description: 'Search query' },
      { name: 'slug', description: 'Market slug or Polymarket URL' },
      { name: 'active', description: 'Only active markets (flag)' },
      { name: 'limit', description: 'Max results (default: 20)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const params: Record<string, string> = {};
  const query = getOptional(flags, 'query');
  if (query) params.query = query;
  const slug = getOptional(flags, 'slug');
  if (slug) params.slug = slug;
  if (flags['active'] === true || flags['active'] === 'true') params.active = 'true';
  const limit = getOptional(flags, 'limit');
  if (limit) params.limit = limit;

  const res = await vincentGet('/api/skills/polymarket/markets', apiKey, params);
  console.log(JSON.stringify(res, null, 2));
}
