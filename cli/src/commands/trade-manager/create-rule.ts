import {
  parseArgs,
  getRequired,
  getRequiredNumber,
  getNumber,
  hasFlag,
  showHelp,
} from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('trade-manager create-rule', [
      { name: 'key-id', description: 'Polymarket API key ID' },
      { name: 'market-id', description: 'Market condition ID', required: true },
      { name: 'token-id', description: 'Outcome token ID', required: true },
      {
        name: 'rule-type',
        description: 'STOP_LOSS, TAKE_PROFIT, or TRAILING_STOP',
        required: true,
      },
      { name: 'trigger-price', description: 'Trigger price (0-1)', required: true },
      { name: 'trailing-percent', description: 'Trailing percent (TRAILING_STOP only)' },
    ]);
    return;
  }

  const apiKey = resolveApiKey(flags, 'POLYMARKET_WALLET');
  const body: Record<string, unknown> = {
    marketId: getRequired(flags, 'market-id'),
    tokenId: getRequired(flags, 'token-id'),
    ruleType: getRequired(flags, 'rule-type'),
    triggerPrice: getRequiredNumber(flags, 'trigger-price'),
    action: { type: 'SELL_ALL' },
  };
  const trailingPercent = getNumber(flags, 'trailing-percent');
  if (trailingPercent !== undefined) body.trailingPercent = trailingPercent;

  const res = await vincentPost('/api/skills/polymarket/rules', apiKey, body);
  console.log(JSON.stringify(res, null, 2));
}
