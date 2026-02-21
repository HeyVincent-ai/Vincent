export type SecretType = 'EVM_WALLET' | 'POLYMARKET_WALLET' | 'RAW_SIGNER' | 'DATA_SOURCES';

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
