import { parseArgs, getRequired, getNumber, hasFlag, showHelp } from '../../lib/args.js';
import { vincentPost } from '../../lib/client.js';
import { storeKey } from '../../lib/keystore.js';
import { validateSecretType } from '../../lib/types.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('secret create', [
      {
        name: 'type',
        description: 'Secret type (EVM_WALLET, RAW_SIGNER, POLYMARKET_WALLET, DATA_SOURCES)',
        required: true,
      },
      { name: 'memo', description: 'Description for this secret', required: true },
      { name: 'chain-id', description: 'Chain ID (for EVM_WALLET)' },
    ]);
    return;
  }

  const type = validateSecretType(getRequired(flags, 'type'));
  const memo = getRequired(flags, 'memo');
  const chainId = getNumber(flags, 'chain-id');

  const body: Record<string, unknown> = { type, memo };
  if (chainId !== undefined) body.chainId = chainId;

  const res = (await vincentPost('/api/secrets', null, body)) as Record<string, unknown>;

  const apiKey = res.apiKey as string;
  const keyId = (res.apiKeyId as string) || (res.id as string);

  const secretId = (res.secretId as string) || (res.id as string);

  storeKey({
    id: keyId,
    apiKey,
    type,
    memo,
    secretId,
    createdAt: new Date().toISOString(),
  });

  console.log(
    JSON.stringify(
      {
        keyId,
        claimUrl: res.claimUrl,
        address: res.address,
        secretId,
      },
      null,
      2
    )
  );
}
