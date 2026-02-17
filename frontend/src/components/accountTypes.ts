import type { ComponentType } from 'react';
import { WalletIcon, PolymarketIcon, SignerIcon, DataSourceIcon } from './icons';

export interface AccountTypeConfig {
  label: string;
  pluralLabel: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  memoPlaceholder: string;
}

export const ACCOUNT_TYPES: Record<string, AccountTypeConfig> = {
  EVM_WALLET: {
    label: 'Smart Contract Wallet',
    pluralLabel: 'Smart Contract Wallets',
    icon: WalletIcon,
    description:
      'An EVM smart account for on-chain transactions. Supports ETH, Base, Polygon, and more.',
    memoPlaceholder: 'e.g. My trading bot wallet',
  },
  POLYMARKET_WALLET: {
    label: 'Polymarket Wallet',
    pluralLabel: 'Polymarket Wallets',
    icon: PolymarketIcon,
    description: 'A Gnosis Safe wallet for trading on Polymarket prediction markets.',
    memoPlaceholder: 'e.g. Election predictions',
  },
  RAW_SIGNER: {
    label: 'EOA Wallet',
    pluralLabel: 'EOA Wallets',
    icon: SignerIcon,
    description:
      'An externally owned account with Ethereum, Solana, and Bitcoin addresses. Supports x402 payments.',
    memoPlaceholder: 'e.g. Cross-chain agent signer',
  },
  DATA_SOURCES: {
    label: 'Data Source',
    pluralLabel: 'Data Sources',
    icon: DataSourceIcon,
    description: 'API credentials for premium data services like market data and analytics.',
    memoPlaceholder: 'e.g. Market data feed',
  },
};

export const ACCOUNT_TYPE_ORDER = ['EVM_WALLET', 'POLYMARKET_WALLET', 'RAW_SIGNER', 'DATA_SOURCES'];

export function getAccountTypeConfig(type: string): AccountTypeConfig {
  return (
    ACCOUNT_TYPES[type] || {
      label: type.replace(/_/g, ' '),
      pluralLabel: type.replace(/_/g, ' '),
      icon: WalletIcon,
      description: '',
      memoPlaceholder: 'e.g. My account',
    }
  );
}
