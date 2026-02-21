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
  const { flags, positional } = parseArgs(argv);
  const subcommand = positional[0];

  if (hasFlag(flags, 'help') || !subcommand) {
    showHelp('wallet swap <preview|execute>', [
      { name: 'key-id', description: 'API key ID' },
      { name: 'sell-token', description: 'Token address to sell', required: true },
      { name: 'buy-token', description: 'Token address to buy', required: true },
      { name: 'sell-amount', description: 'Amount to sell', required: true },
      { name: 'chain-id', description: 'Chain ID', required: true },
      { name: 'slippage', description: 'Slippage tolerance in basis points (execute only)' },
    ]);
    return;
  }

  if (subcommand !== 'preview' && subcommand !== 'execute') {
    console.error(`Unknown subcommand: ${subcommand}. Use "preview" or "execute".`);
    process.exit(1);
  }

  const apiKey = resolveApiKey(flags, 'EVM_WALLET');
  const body: Record<string, unknown> = {
    sellToken: getRequired(flags, 'sell-token'),
    buyToken: getRequired(flags, 'buy-token'),
    sellAmount: getRequired(flags, 'sell-amount'),
    chainId: getRequiredNumber(flags, 'chain-id'),
  };

  if (subcommand === 'execute') {
    const slippage = getNumber(flags, 'slippage');
    if (slippage !== undefined) body.slippageBps = slippage;
  }

  const res = await vincentPost(`/api/skills/evm-wallet/swap/${subcommand}`, apiKey, body);
  console.log(JSON.stringify(res, null, 2));
}
