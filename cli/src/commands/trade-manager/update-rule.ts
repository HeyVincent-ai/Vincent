import { parseArgs, getRequired, getRequiredNumber, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPatch } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('trade-manager update-rule', [
      { name: 'key-id', description: 'Polymarket API key ID' },
      { name: 'rule-id', description: 'Rule ID to update', required: true },
      { name: 'trigger-price', description: 'New trigger price', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const ruleId = getRequired(flags, 'rule-id');
  const res = await vincentPatch(`/api/skills/polymarket/rules/${ruleId}`, apiKey, {
    triggerPrice: getRequiredNumber(flags, 'trigger-price'),
  });
  console.log(JSON.stringify(res, null, 2));
}
