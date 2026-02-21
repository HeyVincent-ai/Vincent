import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket market', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'condition-id', description: 'Market condition ID', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const conditionId = getRequired(flags, 'condition-id');
  const res = await vincentGet(`/api/skills/polymarket/market/${conditionId}`, apiKey);
  console.log(JSON.stringify(res, null, 2));
}
