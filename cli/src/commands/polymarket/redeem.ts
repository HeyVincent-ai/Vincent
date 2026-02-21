import { parseArgs, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('polymarket redeem', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'condition-ids', description: 'Comma-separated condition IDs (omit to redeem all)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const body: Record<string, unknown> = {};
  const conditionIds = getOptional(flags, 'condition-ids');
  if (conditionIds) body.conditionIds = conditionIds.split(',');

  const res = await vincentPost('/api/skills/polymarket/redeem', apiKey, body);
  console.log(JSON.stringify(res, null, 2));
}
