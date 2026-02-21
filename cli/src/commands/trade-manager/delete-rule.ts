import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentDelete } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('trade-manager delete-rule', [
      { name: 'key-id', description: 'Polymarket API key ID' },
      { name: 'rule-id', description: 'Rule ID to delete', required: true },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const ruleId = getRequired(flags, 'rule-id');
  const res = await vincentDelete(`/api/skills/polymarket/rules/${ruleId}`, apiKey);
  console.log(JSON.stringify(res, null, 2));
}
