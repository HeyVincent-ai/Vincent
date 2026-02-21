import { parseArgs, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('wallet address', [
      {
        name: 'key-id',
        description: 'API key ID (auto-discovered if only one EVM_WALLET key exists)',
      },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'EVM_WALLET');
  const res = await vincentGet('/api/skills/evm-wallet/address', apiKey);
  console.log(JSON.stringify(res, null, 2));
}
