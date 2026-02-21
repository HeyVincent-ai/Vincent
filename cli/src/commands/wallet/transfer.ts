import { parseArgs, getRequired, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('wallet transfer', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'to', description: 'Recipient address', required: true },
      { name: 'amount', description: 'Amount to transfer', required: true },
      { name: 'token', description: 'ERC-20 token contract address (omit for native ETH)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'EVM_WALLET');
  const body: Record<string, unknown> = {
    to: getRequired(flags, 'to'),
    amount: getRequired(flags, 'amount'),
  };
  const token = getOptional(flags, 'token');
  if (token) body.token = token;

  const res = await vincentPost('/api/skills/evm-wallet/transfer', apiKey, body);
  console.log(JSON.stringify(res, null, 2));
}
