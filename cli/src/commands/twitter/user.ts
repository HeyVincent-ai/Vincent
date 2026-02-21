import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('twitter user', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'username', description: 'Twitter username', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'DATA_SOURCES');
  const username = getRequired(flags, 'username');
  const res = await vincentGet(`/api/data-sources/twitter/users/${username}`, apiKey);
  console.log(JSON.stringify(res, null, 2));
}
