import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import {
  requestOwnershipChallenge,
  verifyOwnershipSignature,
  getOwnershipStatus,
} from '../api';

interface Props {
  secretId: string;
  walletAddress: string;
  onOwnershipTransferred: () => void;
}

type Step = 'loading' | 'not-eligible' | 'not-ready' | 'connect' | 'ready' | 'signing' | 'processing' | 'success' | 'error';

const chainNames: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  84532: 'Base Sepolia',
  11155111: 'Sepolia',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
};

export default function TakeOwnership({ secretId, walletAddress, onOwnershipTransferred }: Props) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [chainsToTransfer, setChainsToTransfer] = useState<number[]>([]);
  const [txHashes, setTxHashes] = useState<Record<number, string>>({});
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);

  // Check ownership status on mount
  useEffect(() => {
    getOwnershipStatus(secretId)
      .then((res) => {
        const { canTakeOwnership, ownershipTransferred, chainsUsed, ownerAddress: owner } = res.data.data;
        if (!canTakeOwnership) {
          setStep('not-eligible');
        } else if (ownershipTransferred) {
          setOwnerAddress(owner);
          setStep('success');
        } else if (chainsUsed.length === 0) {
          setStep('not-ready');
        } else {
          setChainsToTransfer(chainsUsed);
          setStep(isConnected ? 'ready' : 'connect');
        }
      })
      .catch(() => {
        setStep('error');
        setError('Failed to load ownership status');
      });
  }, [secretId]);

  // Update step when wallet connects/disconnects
  useEffect(() => {
    if (step === 'connect' && isConnected) {
      setStep('ready');
    } else if (step === 'ready' && !isConnected) {
      setStep('connect');
    }
  }, [isConnected, step]);

  const handleTakeOwnership = async () => {
    if (!address) return;

    try {
      setError(null);

      // 1. Request challenge from backend
      setStep('processing');
      const challengeRes = await requestOwnershipChallenge(secretId, address);
      const { challenge, chainsToTransfer: chains } = challengeRes.data.data;
      setChainsToTransfer(chains);

      // 2. Sign the challenge
      setStep('signing');
      const signature = await signMessageAsync({ message: challenge });

      // 3. Verify signature and transfer ownership
      setStep('processing');
      const verifyRes = await verifyOwnershipSignature(secretId, address, signature);
      setTxHashes(verifyRes.data.data.txHashes);
      setOwnerAddress(address);

      setStep('success');
      onOwnershipTransferred();
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes('rejected')) {
        // User rejected signature
        setError('Signature rejected. Please try again.');
        setStep('ready');
      } else {
        setError(err.response?.data?.error?.message || err.message || 'Failed to take ownership');
        setStep('error');
      }
    }
  };

  if (step === 'loading') {
    return (
      <div className="bg-white rounded-lg border p-6">
        <p className="text-gray-500">Loading ownership status...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-2">Take Ownership</h3>

      {step === 'not-eligible' && (
        <div className="bg-muted/50 border border-border rounded p-4">
          <p className="text-muted-foreground text-sm">
            This wallet was created before the self-custody feature was available, so it cannot
            be transferred to your personal wallet. To take ownership of a wallet, create a new
            one and move your assets to it.
          </p>
        </div>
      )}

      {step === 'not-ready' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <p className="text-yellow-800 text-sm">
            This wallet hasn't been used on any chain yet. Make at least one transaction
            before taking ownership.
          </p>
        </div>
      )}

      {step === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <p className="text-green-800 font-medium mb-2">Ownership Transferred</p>
          <p className="text-green-700 text-sm mb-3">
            You are now the owner of this smart wallet. SafeSkills can still execute
            transactions on your behalf (subject to your policies).
          </p>
          {ownerAddress && (
            <p className="text-green-700 text-xs mb-3">
              Owner: <code className="bg-green-100 px-1 rounded">{ownerAddress}</code>
            </p>
          )}
          {Object.entries(txHashes).length > 0 && (
            <div className="text-xs text-green-600">
              <p className="font-medium mb-1">Transaction hashes:</p>
              {Object.entries(txHashes).map(([chainId, hash]) => (
                <p key={chainId}>
                  {chainNames[Number(chainId)] || `Chain ${chainId}`}:{' '}
                  <code className="bg-green-100 px-1 rounded">{hash.slice(0, 10)}...</code>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {(step === 'connect' || step === 'ready' || step === 'signing' || step === 'processing') && (
        <>
          <p className="text-sm text-gray-600 mb-4">
            Transfer ownership of this smart wallet to your personal wallet.
            After transfer, you'll be the owner of the account at{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">{walletAddress}</code>.
          </p>

          {chainsToTransfer.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
              <p className="text-blue-800 text-sm">
                <span className="font-medium">Chains to transfer:</span>{' '}
                {chainsToTransfer.map((c) => chainNames[c] || `Chain ${c}`).join(', ')}
              </p>
            </div>
          )}

          {!isConnected ? (
            <div>
              <p className="text-sm text-gray-500 mb-3">Connect your wallet to take ownership:</p>
              <ConnectButton />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-sm text-gray-700">
                  Connected: <code className="bg-gray-100 px-1 rounded">{address}</code>
                </p>
                <button
                  onClick={() => disconnect()}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Disconnect
                </button>
              </div>

              {step === 'ready' && (
                <button
                  onClick={handleTakeOwnership}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Take Ownership
                </button>
              )}

              {step === 'signing' && (
                <div className="flex items-center gap-2 text-yellow-600">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Please sign the message in your wallet...</span>
                </div>
              )}

              {step === 'processing' && (
                <div className="flex items-center gap-2 text-blue-600">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Processing ownership transfer...</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {step === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-800 mb-2">{error}</p>
          <button
            onClick={() => setStep(isConnected ? 'ready' : 'connect')}
            className="text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {error && step !== 'error' && (
        <p className="text-red-600 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
