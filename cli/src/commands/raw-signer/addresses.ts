import { parseArgs, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('raw-signer addresses', [{ name: 'key-id', description: 'API key ID' }]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'RAW_SIGNER');
  const res = await vincentGet('/api/skills/raw-signer/addresses', apiKey);
  console.log(JSON.stringify(res, null, 2));
}
