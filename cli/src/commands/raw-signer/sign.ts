import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('raw-signer sign', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'message', description: 'Hex-encoded message to sign (0x...)', required: true },
      { name: 'curve', description: 'Signing curve: ethereum or solana', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'RAW_SIGNER');
  const res = await vincentPost('/api/skills/raw-signer/sign', apiKey, {
    message: getRequired(flags, 'message'),
    curve: getRequired(flags, 'curve'),
  });
  console.log(JSON.stringify(res, null, 2));
}
