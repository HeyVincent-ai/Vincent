import { parseArgs, getRequired, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('wallet send-tx', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'to', description: 'Contract address', required: true },
      { name: 'data', description: 'Hex-encoded calldata', required: true },
      { name: 'value', description: 'ETH value to send (default: 0)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'EVM_WALLET');
  const body: Record<string, unknown> = {
    to: getRequired(flags, 'to'),
    data: getRequired(flags, 'data'),
  };
  const value = getOptional(flags, 'value');
  if (value) body.value = value;

  const res = await vincentPost('/api/skills/evm-wallet/send-transaction', apiKey, body);
  console.log(JSON.stringify(res, null, 2));
}
