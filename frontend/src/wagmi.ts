import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, base, sepolia, baseSepolia, arbitrum, optimism, polygon } from 'wagmi/chains';
import { env } from './env';

export const config = getDefaultConfig({
  appName: 'SafeSkills',
  projectId: env.WALLETCONNECT_PROJECT_ID,
  chains: [mainnet, base, sepolia, baseSepolia, arbitrum, optimism, polygon],
  ssr: false,
});
