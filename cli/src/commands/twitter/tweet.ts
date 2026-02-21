import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('twitter tweet', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'tweet-id', description: 'Tweet ID', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'DATA_SOURCES');
  const tweetId = getRequired(flags, 'tweet-id');
  const res = await vincentGet(`/api/data-sources/twitter/tweets/${tweetId}`, apiKey);
  console.log(JSON.stringify(res, null, 2));
}
