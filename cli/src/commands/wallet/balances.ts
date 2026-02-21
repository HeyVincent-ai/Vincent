import { parseArgs, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('wallet balances', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'chain-ids', description: 'Comma-separated chain IDs to filter' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'EVM_WALLET');
  const params: Record<string, string> = {};
  const chainIds = getOptional(flags, 'chain-ids');
  if (chainIds) params.chainIds = chainIds;

  const res = await vincentGet('/api/skills/evm-wallet/balances', apiKey, params);
  console.log(JSON.stringify(res, null, 2));
}
