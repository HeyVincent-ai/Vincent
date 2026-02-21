import { parseArgs, getRequired, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('twitter search', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'q', description: 'Search query', required: true },
      { name: 'max-results', description: 'Max results (default: 10)' },
      { name: 'start-time', description: 'Start time (ISO 8601)' },
      { name: 'end-time', description: 'End time (ISO 8601)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'DATA_SOURCES');
  const params: Record<string, string> = { q: getRequired(flags, 'q') };
  const maxResults = getOptional(flags, 'max-results');
  if (maxResults) params.max_results = maxResults;
  const startTime = getOptional(flags, 'start-time');
  if (startTime) params.start_time = startTime;
  const endTime = getOptional(flags, 'end-time');
  if (endTime) params.end_time = endTime;

  const res = await vincentGet('/api/data-sources/twitter/search', apiKey, params);
  console.log(JSON.stringify(res, null, 2));
}
