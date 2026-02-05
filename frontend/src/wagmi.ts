import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, base, sepolia, baseSepolia, arbitrum, optimism, polygon } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'SafeSkills',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains: [mainnet, base, sepolia, baseSepolia, arbitrum, optimism, polygon],
  ssr: false,
});
