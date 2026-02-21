import { parseArgs, getRequired, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('brave news', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'q', description: 'Search query', required: true },
      { name: 'count', description: 'Number of results (1-20)' },
      { name: 'freshness', description: 'Time filter: pd, pw, pm, py' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'DATA_SOURCES');
  const params: Record<string, string> = { q: getRequired(flags, 'q') };
  const count = getOptional(flags, 'count');
  if (count) params.count = count;
  const freshness = getOptional(flags, 'freshness');
  if (freshness) params.freshness = freshness;

  const res = await vincentGet('/api/data-sources/brave/news', apiKey, params);
  console.log(JSON.stringify(res, null, 2));
}
