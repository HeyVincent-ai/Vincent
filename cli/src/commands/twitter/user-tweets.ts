import { parseArgs, getRequired, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('twitter user-tweets', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'user-id', description: 'Twitter user ID', required: true },
      { name: 'max-results', description: 'Max results' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'DATA_SOURCES');
  const userId = getRequired(flags, 'user-id');
  const params: Record<string, string> = {};
  const maxResults = getOptional(flags, 'max-results');
  if (maxResults) params.max_results = maxResults;

  const res = await vincentGet(`/api/data-sources/twitter/users/${userId}/tweets`, apiKey, params);
  console.log(JSON.stringify(res, null, 2));
}
