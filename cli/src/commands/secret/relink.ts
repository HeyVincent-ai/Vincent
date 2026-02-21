import { parseArgs, getRequired, hasFlag, showHelp } from '../../lib/args.js';
import { vincentPost } from '../../lib/client.js';
import { storeKey } from '../../lib/keystore.js';
import type { SecretType } from '../../lib/types.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('secret relink', [
      { name: 'token', description: 'Re-link token from the wallet owner', required: true },
    ]);
    return;
  }

  const token = getRequired(flags, 'token');

  const res = (await vincentPost('/api/secrets/relink', null, {
    relinkToken: token,
    apiKeyName: 'Re-linked API Key',
  })) as {
    data: {
      secret: { id: string; type: SecretType };
      apiKey: { id: string; key: string };
    };
  };

  const { secret, apiKey: apiKeyObj } = res.data;
  const apiKey = apiKeyObj.key;
  const keyId = apiKeyObj.id;
  const type = secret.type;

  storeKey({
    id: keyId,
    apiKey,
    type,
    memo: `Re-linked ${type}`,
    secretId: secret.id as string,
    createdAt: new Date().toISOString(),
  });

  console.log(
    JSON.stringify(
      {
        keyId,
        secretId: secret.id,
        type,
      },
      null,
      2
    )
  );
}
