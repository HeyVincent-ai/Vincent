import { parseArgs, getRequired, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { resolveApiKey } from '../../lib/keystore.js';
import { vincentPost, vincentGet } from '../../lib/client.js';

export async function run(argv: string[]): Promise<void> {
  const { flags, positional } = parseArgs(argv);
  const subcommand = positional[0];

  if (hasFlag(flags, 'help') || !subcommand) {
    showHelp('wallet transfer-between <preview|execute|status>', [
      { name: 'key-id', description: 'API key ID' },
      {
        name: 'to-secret-id',
        description: 'Destination secret ID (preview/execute)',
        required: true,
      },
      { name: 'from-chain', description: 'Source chain ID (preview/execute)', required: true },
      { name: 'to-chain', description: 'Destination chain ID (preview/execute)', required: true },
      {
        name: 'token-in',
        description: 'Input token address or ETH (preview/execute)',
        required: true,
      },
      { name: 'amount', description: 'Amount to transfer (preview/execute)', required: true },
      {
        name: 'token-out',
        description: 'Output token address or ETH (preview/execute)',
        required: true,
      },
      { name: 'slippage', description: 'Slippage in basis points' },
      { name: 'relay-id', description: 'Relay request ID (status only)' },
    ]);
    return;
  }

  if (subcommand !== 'preview' && subcommand !== 'execute' && subcommand !== 'status') {
    console.error(`Unknown subcommand: ${subcommand}. Use "preview", "execute", or "status".`);
    process.exit(1);
  }

  const apiKey = resolveApiKey(flags, 'EVM_WALLET');

  if (subcommand === 'status') {
    const relayId = getRequired(flags, 'relay-id');
    const res = await vincentGet(
      `/api/skills/evm-wallet/transfer-between-secrets/status/${relayId}`,
      apiKey
    );
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const body: Record<string, unknown> = {
    toSecretId: getRequired(flags, 'to-secret-id'),
    fromChainId: Number(getRequired(flags, 'from-chain')),
    toChainId: Number(getRequired(flags, 'to-chain')),
    tokenIn: getRequired(flags, 'token-in'),
    tokenInAmount: getRequired(flags, 'amount'),
    tokenOut: getRequired(flags, 'token-out'),
  };
  const slippage = getOptional(flags, 'slippage');
  if (slippage) body.slippage = Number(slippage);

  const res = await vincentPost(
    `/api/skills/evm-wallet/transfer-between-secrets/${subcommand}`,
    apiKey,
    body
  );
  console.log(JSON.stringify(res, null, 2));
}
