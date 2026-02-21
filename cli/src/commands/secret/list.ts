import { parseArgs, getOptional, hasFlag, showHelp } from '../../lib/args.js';
import { listKeys } from '../../lib/keystore.js';
import type { SecretType } from '../../lib/types.js';

export async function run(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, 'help')) {
    showHelp('secret list', [
      {
        name: 'type',
        description: 'Filter by type (EVM_WALLET, RAW_SIGNER, POLYMARKET_WALLET, DATA_SOURCES)',
      },
    ]);
    return;
  }

  const type = getOptional(flags, 'type') as SecretType | undefined;
  const keys = listKeys(type);

  console.log(
    JSON.stringify(
      keys.map((k) => ({ id: k.id, type: k.type, memo: k.memo, createdAt: k.createdAt })),
      null,
      2
    )
  );
}
