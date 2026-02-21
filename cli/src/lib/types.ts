export type SecretType = 'EVM_WALLET' | 'POLYMARKET_WALLET' | 'RAW_SIGNER' | 'DATA_SOURCES';

const VALID_SECRET_TYPES: readonly string[] = [
  'EVM_WALLET',
  'POLYMARKET_WALLET',
  'RAW_SIGNER',
  'DATA_SOURCES',
];

export function validateSecretType(value: string): SecretType {
  if (!VALID_SECRET_TYPES.includes(value)) {
    console.error(
      `Invalid secret type "${value}". Expected one of: ${VALID_SECRET_TYPES.join(', ')}`
    );
    process.exit(1);
  }
  return value as SecretType;
}

export interface KeyData {
  id: string;
  apiKey: string;
  type: SecretType;
  memo: string;
  secretId: string;
  createdAt: string;
}

export interface ArgDef {
  name: string;
  description: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
}

export interface VincentError {
  error: string;
  message?: string;
  statusCode?: number;
}
