import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StytchProvider } from '@stytch/react';
import { StytchUIClient } from '@stytch/vanilla-js';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';
import { env } from './env';
import { initSentry, Sentry } from './sentry';
import './index.css';
import App from './App';
import { config } from './wagmi';

// Initialize Sentry early
initSentry();

const stytchClient = new StytchUIClient(env.STYTCH_PUBLIC_TOKEN);

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <StytchProvider stytch={stytchClient}>
            <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
              <App />
            </Sentry.ErrorBoundary>
          </StytchProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
