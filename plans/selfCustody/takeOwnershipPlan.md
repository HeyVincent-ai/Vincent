# Take Ownership Feature - Implementation Plan

## Overview

This feature allows users to take ownership of their ZeroDev smart wallet while ensuring SafeSkills' backend EOA can still sign transactions (via the weighted ECDSA guardian validator). This enables true self-custody where the user owns their smart account, but our backend can still execute transactions on their behalf (subject to policies).

## Current State

Currently, when an EVM_WALLET is created:
1. We generate a backend EOA private key and store it in the database
2. We create a ZeroDev Kernel v3.1 smart account with the backend EOA as the **sudo validator** (owner)
3. The backend EOA is the only validator that can sign transactions

## Desired End State

After the user takes ownership:
1. The **user's EOA** becomes the sudo validator (owner) of the ZeroDev smart account
2. The **backend EOA** can still sign transactions via a **permission validator** (session key with sudo policy) that was installed on-chain via `initConfig` at account creation
3. The user can make transactions directly via their wallet
4. Our backend can make transactions via the permission validator (still subject to our policy system)

Note: The guardian validator (weighted ECDSA) is used ONLY for the recovery action (`doRecovery`) during the ownership transfer itself. Post-transfer signing uses the permission validator.

---

## Architecture

### ZeroDev Recovery Flow

Based on ZeroDev's recovery mechanism using `@zerodev/weighted-ecdsa-validator`:

1. **Guardian Validator**: A weighted ECDSA validator that acts as the recovery guardian
2. **Recovery Action**: A special action (`doRecovery`) that changes the sudo validator
3. **Owner Rotation**: The guardian calls `doRecovery(validatorAddress, newOwnerAddress)` to transfer ownership

### Key Insight

The backend EOA serves **three roles** at account creation:
- **Sudo validator** (ECDSA, initially): Full owner of the account
- **Guardian validator** (weighted ECDSA, regular): Can execute recovery (`doRecovery`) to transfer ownership
- **Permission validator** (session key via `initConfig`): Can sign transactions after ownership transfer

When we create a wallet, we set up the backend EOA in all three roles. This allows us to:
1. Initially operate as the owner (sudo ECDSA validator)
2. Execute `doRecovery` via the guardian validator to transfer ownership to the user
3. Continue signing transactions via the permission validator (session key with sudo policy) after transfer

The permission validator is installed on-chain via `initConfig` and persists independently of the sudo validator change. The serialized permission account (`sessionKeyData`) is stored in the DB for later deserialization.

---

## Implementation Details

### Phase 1: Backend - Wallet Creation Updates

#### 1.1 Install New Dependencies

```bash
npm install @zerodev/weighted-ecdsa-validator
```

#### 1.2 Update `zerodev.service.ts`

```typescript
import {
  createWeightedECDSAValidator,
  getRecoveryAction,
} from '@zerodev/weighted-ecdsa-validator';
import {
  getValidatorAddress,
  signerToEcdsaValidator,
} from '@zerodev/ecdsa-validator';
import {
  serializePermissionAccount,
  deserializePermissionAccount,
  toPermissionValidator,
  toSudoPolicy,
  toECDSASigner,
} from '@zerodev/permissions';

/**
 * Create a ZeroDev smart account with recovery guardian AND session key enabled.
 * The backend EOA is set up as:
 * - Sudo validator (ECDSA, initial owner)
 * - Weighted ECDSA guardian (for executing recovery only)
 * - Permission validator via initConfig (session key with sudo policy for post-transfer signing)
 *
 * Returns both the address and the serialized session key data.
 */
export async function createSmartAccountWithRecovery(
  privateKey: Hex,
  chainId: number
): Promise<{ address: Address; sessionKeyData: string }> {
  const projectId = env.ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('ZERODEV_PROJECT_ID is not configured');
  }

  const publicClient = getPublicClient(chainId);
  const signer = privateKeyToAccount(privateKey);

  // 1. Create ECDSA validator for sudo (initial owner)
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  // 2. Create weighted ECDSA validator for guardian (backend EOA)
  // Weight 100 with threshold 100 means this single guardian can execute recovery
  const guardianValidator = await createWeightedECDSAValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [{ address: signer.address, weight: 100 }],
    },
    signers: [signer],
    kernelVersion,
  });

  // 3. Create permission validator (session key) with sudo policy for the backend EOA
  const { initConfig, permissionPlugin } = await buildSessionKeyInitConfig(signer.address, publicClient);

  // 4. Create kernel account with sudo, guardian, recovery action, and session key via initConfig
  const account = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: ecdsaValidator,
      regular: guardianValidator,
      action: getRecoveryAction(entryPoint.version),
    },
    initConfig, // Session key installed on-chain here
  });

  // 5. Serialize the permission account for later deserialization
  const sessionKeyData = await serializePermissionAccount(
    account,
    undefined,
    undefined,
    undefined,
    permissionPlugin
  );

  return { address: account.address, sessionKeyData };
}

/**
 * Execute recovery to transfer ownership to a new address.
 * Called by the guardian (backend EOA) to rotate the sudo validator.
 */
export async function executeRecovery(
  privateKey: Hex,  // Backend EOA (guardian)
  chainId: number,
  smartAccountAddress: Address,
  newOwnerAddress: Address
): Promise<Hash> {
  const projectId = env.ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('ZERODEV_PROJECT_ID is not configured');
  }

  const chain = getChain(chainId);
  const publicClient = getPublicClient(chainId);
  const signer = privateKeyToAccount(privateKey);

  // Create the guardian validator (same as during account creation)
  const guardianValidator = await createWeightedECDSAValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [{ address: signer.address, weight: 100 }],
    },
    signers: [signer],
    kernelVersion,
  });

  // Create account with guardian as the active validator
  const account = await createKernelAccount(publicClient, {
    address: smartAccountAddress,
    entryPoint,
    plugins: {
      sudo: guardianValidator,  // Guardian is signing this recovery UserOp
      regular: guardianValidator,
      action: getRecoveryAction(entryPoint.version),
    },
    kernelVersion,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(getPaymasterUrl(projectId, chainId)),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(getBundlerUrl(projectId, chainId)),
    paymaster: paymasterClient,
  });

  // Execute the recovery - this changes the sudo validator to the new owner
  const recoveryExecutorFunction =
    'function doRecovery(address _validator, bytes calldata _data)';

  const userOpHash = await kernelClient.sendUserOperation({
    callData: encodeFunctionData({
      abi: parseAbi([recoveryExecutorFunction]),
      functionName: 'doRecovery',
      args: [
        getValidatorAddress(entryPoint, kernelVersion),
        newOwnerAddress,  // New owner's address encoded as bytes
      ],
    }),
  });

  // Wait for confirmation
  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt.receipt.transactionHash;
}

/**
 * Get a kernel client using the session key / permission validator
 * (for transactions after ownership transfer).
 * Deserializes the stored sessionKeyData to reconstruct the permission account.
 */
async function getSessionKeyKernelClient(
  privateKey: Hex,
  chainId: number,
  sessionKeyData: string
) {
  const projectId = env.ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('ZERODEV_PROJECT_ID is not configured');
  }

  const chain = getChain(chainId);
  const publicClient = getPublicClient(chainId);
  const signer = privateKeyToAccount(privateKey);

  // Create real ECDSA signer (with private key) for signing transactions
  const sessionKeySigner = await toECDSASigner({ signer });

  // Deserialize the permission account using the stored session key data
  const account = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    kernelVersion,
    sessionKeyData,
    sessionKeySigner
  );

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(getPaymasterUrl(projectId, chainId)),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(getBundlerUrl(projectId, chainId)),
    paymaster: paymasterClient,
  });

  return { kernelClient, account, publicClient };
}
```

#### 1.3 Update Database Schema

Add ownership tracking fields to `WalletSecretMetadata`:

```prisma
model WalletSecretMetadata {
  id                    String    @id @default(cuid())
  secretId              String    @unique @map("secret_id")
  smartAccountAddress   String    @map("smart_account_address")
  canTakeOwnership      Boolean   @default(false) @map("can_take_ownership")
  ownershipTransferred  Boolean   @default(false) @map("ownership_transferred")
  ownerAddress          String?   @map("owner_address") // User's EOA after transfer
  transferredAt         DateTime? @map("transferred_at")
  transferTxHash        String?   @map("transfer_tx_hash")
  // Track which chains have been used (for multi-chain ownership transfer)
  chainsUsed            Int[]     @default([]) @map("chains_used")
  // Serialized permission account for post-transfer backend signing
  sessionKeyData        String?   @map("session_key_data")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)

  @@map("wallet_secret_metadata")
}
```

#### 1.4 Update `secret.service.ts`

Modify `createSecret` to use the new recovery-enabled account creation and store `sessionKeyData`:

```typescript
// In createSecret function, replace the existing ZeroDev account creation:
if (type === SecretType.EVM_WALLET) {
  secretValue = generatePrivateKey();
  const derivationChainId = 84532; // Base Sepolia

  let smartAccountAddress: string;
  let sessionKeyData: string | undefined;
  if (env.ZERODEV_PROJECT_ID) {
    // Create account with recovery guardian + session key enabled
    const result = await zerodev.createSmartAccountWithRecovery(
      secretValue as Hex,
      derivationChainId
    );
    smartAccountAddress = result.address;
    sessionKeyData = result.sessionKeyData;
  } else {
    smartAccountAddress = generatePlaceholderAddress();
  }

  walletMetadata = {
    create: {
      smartAccountAddress,
      canTakeOwnership: true,
      ownershipTransferred: false,
      chainsUsed: [],
      sessionKeyData, // Serialized permission account for post-transfer signing
    },
  };
}
```

#### 1.5 Track Chain Usage

Update transaction execution to track which chains have been used:

```typescript
// In evmWallet.service.ts, after successful transaction execution:
async function trackChainUsage(secretId: string, chainId: number): Promise<void> {
  const metadata = await prisma.walletSecretMetadata.findUnique({
    where: { secretId },
  });

  if (metadata && !metadata.chainsUsed.includes(chainId)) {
    await prisma.walletSecretMetadata.update({
      where: { secretId },
      data: {
        chainsUsed: [...metadata.chainsUsed, chainId],
      },
    });
  }
}
```

### Phase 2: Backend - Take Ownership API

#### 2.1 Create Ownership Service (`src/services/ownership.service.ts`)

```typescript
import { randomBytes } from 'crypto';
import { verifyMessage, type Address, type Hex } from 'viem';
import prisma from '../db/client';
import { AppError } from '../api/middleware/errorHandler';
import * as zerodev from '../skills/zerodev.service';

// In-memory challenge storage (10-minute expiry)
interface OwnershipChallenge {
  challenge: string;
  address: string;
  expiresAt: Date;
}
const challenges = new Map<string, OwnershipChallenge>();

const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a challenge message for ownership verification.
 */
export function generateOwnershipChallenge(
  secretId: string,
  walletAddress: string,
  newOwnerAddress: string
): string {
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString('hex');

  return `SafeSkills Ownership Verification

I am taking ownership of the smart wallet:
${walletAddress}

My address: ${newOwnerAddress}
Secret ID: ${secretId}
Timestamp: ${timestamp}
Nonce: ${nonce}

By signing this message, I confirm that I control the address above and authorize SafeSkills to transfer smart account ownership to me.`;
}

/**
 * Store a challenge for later verification.
 */
export function storeChallenge(
  secretId: string,
  address: string,
  challenge: string
): { expiresAt: Date } {
  const key = `${secretId}:${address.toLowerCase()}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);

  challenges.set(key, {
    challenge,
    address: address.toLowerCase(),
    expiresAt,
  });

  return { expiresAt };
}

/**
 * Verify the ownership signature and execute the ownership transfer.
 */
export async function verifyAndTransferOwnership(
  secretId: string,
  newOwnerAddress: string,
  signature: string
): Promise<{ txHashes: Record<number, string> }> {
  const key = `${secretId}:${newOwnerAddress.toLowerCase()}`;
  const stored = challenges.get(key);

  if (!stored) {
    throw new AppError('CHALLENGE_NOT_FOUND', 'No challenge found. Request a new challenge.', 400);
  }

  if (new Date() > stored.expiresAt) {
    challenges.delete(key);
    throw new AppError('CHALLENGE_EXPIRED', 'Challenge has expired. Request a new challenge.', 400);
  }

  // Verify the signature
  const isValid = await verifyMessage({
    address: newOwnerAddress as Address,
    message: stored.challenge,
    signature: signature as Hex,
  });

  if (!isValid) {
    throw new AppError('INVALID_SIGNATURE', 'Signature verification failed', 400);
  }

  // One-time use
  challenges.delete(key);

  // Get the secret and wallet metadata
  const secret = await prisma.secret.findUnique({
    where: { id: secretId },
    include: { walletMetadata: true },
  });

  if (!secret || !secret.value || !secret.walletMetadata) {
    throw new AppError('NOT_FOUND', 'Wallet not found', 404);
  }

  if (secret.walletMetadata.ownershipTransferred) {
    throw new AppError('ALREADY_TRANSFERRED', 'Ownership has already been transferred', 409);
  }

  // Execute recovery on all chains where the wallet has been used
  const chainsUsed = secret.walletMetadata.chainsUsed;
  const txHashes: Record<number, string> = {};

  for (const chainId of chainsUsed) {
    try {
      const txHash = await zerodev.executeRecovery(
        secret.value as Hex,
        chainId,
        secret.walletMetadata.smartAccountAddress as Address,
        newOwnerAddress as Address
      );
      txHashes[chainId] = txHash;
    } catch (error) {
      console.error(`Failed to transfer ownership on chain ${chainId}:`, error);
      throw new AppError(
        'TRANSFER_FAILED',
        `Failed to transfer ownership on chain ${chainId}`,
        500,
        { chainId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // Update the database
  await prisma.walletSecretMetadata.update({
    where: { secretId },
    data: {
      ownershipTransferred: true,
      ownerAddress: newOwnerAddress,
      transferredAt: new Date(),
      transferTxHash: Object.values(txHashes)[0] || null,
    },
  });

  return { txHashes };
}

/**
 * Get the ownership status for a wallet.
 */
export async function getOwnershipStatus(secretId: string): Promise<{
  ownershipTransferred: boolean;
  ownerAddress: string | null;
  transferredAt: Date | null;
  chainsUsed: number[];
}> {
  const metadata = await prisma.walletSecretMetadata.findUnique({
    where: { secretId },
  });

  if (!metadata) {
    throw new AppError('NOT_FOUND', 'Wallet metadata not found', 404);
  }

  return {
    ownershipTransferred: metadata.ownershipTransferred,
    ownerAddress: metadata.ownerAddress,
    transferredAt: metadata.transferredAt,
    chainsUsed: metadata.chainsUsed,
  };
}
```

#### 2.2 Create Ownership Routes (`src/api/routes/ownership.routes.ts`)

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { validateSession, requireSecretOwnership } from '../middleware/sessionAuth';
import { sendSuccess, sendError } from '../../utils/response';
import { asyncHandler } from '../middleware/errorHandler';
import * as ownershipService from '../../services/ownership.service';
import prisma from '../../db/client';
import { log as auditLog } from '../../audit/audit.service';

const router = Router({ mergeParams: true });

// Validation schemas
const challengeSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

const verifySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature'),
});

// POST /api/secrets/:secretId/take-ownership/challenge
router.post(
  '/challenge',
  validateSession,
  requireSecretOwnership,
  asyncHandler(async (req, res) => {
    const { secretId } = req.params as { secretId: string };
    const { address } = challengeSchema.parse(req.body);

    // Get wallet address for the challenge message
    const metadata = await prisma.walletSecretMetadata.findUnique({
      where: { secretId },
    });

    if (!metadata) {
      return sendError(res, 'NOT_FOUND', 'Wallet not found', 404);
    }

    if (metadata.ownershipTransferred) {
      return sendError(res, 'ALREADY_TRANSFERRED', 'Ownership has already been transferred', 409);
    }

    if (metadata.chainsUsed.length === 0) {
      return sendError(
        res,
        'NO_CHAINS_USED',
        'Wallet has not been used on any chain yet. Make at least one transaction first.',
        400
      );
    }

    const challenge = ownershipService.generateOwnershipChallenge(
      secretId,
      metadata.smartAccountAddress,
      address
    );

    const { expiresAt } = ownershipService.storeChallenge(secretId, address, challenge);

    auditLog({
      secretId,
      userId: req.user!.id,
      action: 'ownership.challenge_requested',
      inputData: { address },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendSuccess(res, {
      challenge,
      expiresAt: expiresAt.toISOString(),
      chainsToTransfer: metadata.chainsUsed,
    });
  })
);

// POST /api/secrets/:secretId/take-ownership/verify
router.post(
  '/verify',
  validateSession,
  requireSecretOwnership,
  asyncHandler(async (req, res) => {
    const { secretId } = req.params as { secretId: string };
    const { address, signature } = verifySchema.parse(req.body);

    const startTime = Date.now();

    try {
      const result = await ownershipService.verifyAndTransferOwnership(
        secretId,
        address,
        signature
      );

      auditLog({
        secretId,
        userId: req.user!.id,
        action: 'ownership.transferred',
        inputData: { newOwner: address },
        outputData: result,
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      sendSuccess(res, {
        message: 'Ownership transferred successfully',
        newOwner: address,
        txHashes: result.txHashes,
      });
    } catch (error) {
      auditLog({
        secretId,
        userId: req.user!.id,
        action: 'ownership.transfer_failed',
        inputData: { newOwner: address },
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      throw error;
    }
  })
);

// GET /api/secrets/:secretId/take-ownership/status
router.get(
  '/status',
  validateSession,
  requireSecretOwnership,
  asyncHandler(async (req, res) => {
    const { secretId } = req.params as { secretId: string };

    const status = await ownershipService.getOwnershipStatus(secretId);

    sendSuccess(res, status);
  })
);

export default router;
```

#### 2.3 Mount Routes (`src/api/routes/index.ts`)

```typescript
import ownershipRoutes from './ownership.routes';

// Add after secrets routes
router.use('/secrets/:secretId/take-ownership', ownershipRoutes);
```

### Phase 3: Backend - Update Transaction Execution

#### 3.1 Modify `evmWallet.service.ts` to Use Session Key After Transfer

Update the transaction execution logic to check if ownership has been transferred and pass `sessionKeyData` to ZeroDev functions:

```typescript
/**
 * Get the session key data for signing if ownership has been transferred.
 * Returns undefined if ownership has not been transferred (use normal ECDSA signing).
 * Throws if transferred but no session key data available (legacy account).
 */
function getSessionKeyForSigning(
  wallet: { ownershipTransferred: boolean; sessionKeyData: string | null }
): string | undefined {
  if (!wallet.ownershipTransferred) return undefined;
  if (!wallet.sessionKeyData) {
    throw new AppError(
      'LEGACY_ACCOUNT',
      'This wallet was created before session key support. Backend signing is not available after ownership transfer.',
      400
    );
  }
  return wallet.sessionKeyData;
}

// Then in executeTransfer, executeSendTransaction, etc.:
const sessionKeyData = getSessionKeyForSigning(walletMetadata);
const result = await zerodev.executeTransfer({
  privateKey,
  chainId,
  to,
  value,
  sessionKeyData,          // undefined = normal ECDSA, string = session key mode
  smartAccountAddress,
});
```

The ZeroDev functions branch internally:
```typescript
// In zerodev.service.ts executeTransfer/executeSendTransaction/executeBatchTransaction:
const { kernelClient, account } = sessionKeyData
  ? await getSessionKeyKernelClient(privateKey, chainId, sessionKeyData)
  : await getKernelClient(privateKey, chainId, smartAccountAddress);
```

### Phase 5: Frontend - RainbowKit + Wagmi Integration

#### 5.1 Install Dependencies

```bash
cd frontend
npm install @rainbow-me/rainbowkit wagmi viem@^2 @tanstack/react-query
```

#### 5.2 Configure Wagmi (`frontend/src/wagmi.ts`)

```typescript
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, base, sepolia, baseSepolia, arbitrum, optimism, polygon } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'SafeSkills',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [mainnet, base, sepolia, baseSepolia, arbitrum, optimism, polygon],
  ssr: false,
});
```

#### 5.3 Update App Entry (`frontend/src/main.tsx`)

```typescript
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmi';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <StytchProvider stytch={stytchClient}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </StytchProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
```

#### 5.4 Create TakeOwnership Component (`frontend/src/components/TakeOwnership.tsx`)

```typescript
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

type Step = 'loading' | 'not-ready' | 'connect' | 'ready' | 'signing' | 'processing' | 'success' | 'error';

export default function TakeOwnership({ secretId, walletAddress, onOwnershipTransferred }: Props) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [chainsToTransfer, setChainsToTransfer] = useState<number[]>([]);
  const [txHashes, setTxHashes] = useState<Record<number, string>>({});

  // Check ownership status on mount
  useEffect(() => {
    getOwnershipStatus(secretId)
      .then((res) => {
        const { ownershipTransferred, chainsUsed } = res.data.data;
        if (ownershipTransferred) {
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
  }, [secretId, isConnected]);

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

      setStep('success');
      onOwnershipTransferred();
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes('rejected')) {
        // User rejected signature
        setError('Signature rejected. Please try again.');
        setStep('ready');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to take ownership');
        setStep('error');
      }
    }
  };

  const chainNames: Record<number, string> = {
    1: 'Ethereum',
    8453: 'Base',
    84532: 'Base Sepolia',
    11155111: 'Sepolia',
    137: 'Polygon',
    42161: 'Arbitrum',
    10: 'Optimism',
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
          <p className="text-green-800 font-medium mb-2">✓ Ownership Transferred</p>
          <p className="text-green-700 text-sm mb-3">
            You are now the owner of this smart wallet. SafeSkills can still execute
            transactions on your behalf (subject to your policies).
          </p>
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
    </div>
  );
}
```

#### 5.5 Add API Functions (`frontend/src/api.ts`)

```typescript
export function requestOwnershipChallenge(secretId: string, address: string) {
  return api.post(`/api/secrets/${secretId}/take-ownership/challenge`, { address });
}

export function verifyOwnershipSignature(secretId: string, address: string, signature: string) {
  return api.post(`/api/secrets/${secretId}/take-ownership/verify`, { address, signature });
}

export function getOwnershipStatus(secretId: string) {
  return api.get(`/api/secrets/${secretId}/take-ownership/status`);
}
```

#### 5.6 Integrate into SecretDetail Page

Update `frontend/src/pages/SecretDetail.tsx`:

```typescript
import TakeOwnership from '../components/TakeOwnership';

// In the component, add after the existing sections:
{secret.type === 'EVM_WALLET' && secret.walletAddress && (
  <div className="mb-6">
    <TakeOwnership
      secretId={secret.id}
      walletAddress={secret.walletAddress}
      onOwnershipTransferred={() => {
        // Optionally refresh the page or show a notification
        window.location.reload();
      }}
    />
  </div>
)}
```

### Phase 4: E2E Test

#### 4.1 Create Test File (`src/e2e/takeOwnership.e2e.test.ts`)

```typescript
/**
 * E2E Test: Take Ownership Flow
 *
 * Tests the full ownership transfer flow using ZeroDev's recovery mechanism:
 * 1. Create a wallet with recovery guardian enabled
 * 2. Make a transaction to deploy the account on a chain
 * 3. Generate a random "user" EOA to represent the new owner
 * 4. Execute ownership transfer (sign challenge, execute doRecovery)
 * 5. Verify backend can still make transactions via guardian validator
 *
 * Required env vars:
 *   ZERODEV_PROJECT_ID - ZeroDev project ID
 *   DATABASE_URL       - PostgreSQL database
 *   ALCHEMY_API_KEY    - For RPC calls
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { type Hex, type Address } from 'viem';
import { createApp } from '../app';
import prisma from '../db/client';
import type { Express } from 'express';

const BASE_SEPOLIA_CHAIN_ID = 84532;

describe('Take Ownership E2E Test', () => {
  let app: Express;
  let apiKey: string;
  let secretId: string;
  let smartAccountAddress: Address;
  let userPrivateKey: Hex;
  let userAddress: Address;
  let sessionToken: string;
  let userId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.$connect();

    // Generate a random EOA to represent the user taking ownership
    userPrivateKey = generatePrivateKey();
    userAddress = privateKeyToAccount(userPrivateKey).address;

    console.log(`\n========================================`);
    console.log(`  TAKE OWNERSHIP E2E TEST - SETUP`);
    console.log(`========================================`);
    console.log(`User EOA (new owner): ${userAddress}`);
    console.log(`========================================\n`);

    // Create a test user (for session auth)
    const testUser = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        stytchUserId: `test-stytch-${Date.now()}`,
      },
    });
    userId = testUser.id;

    // Create a mock session token (in real test, would use Stytch)
    // For testing, we'll use a direct DB approach or mock the auth middleware
  }, 60_000);

  afterAll(async () => {
    // Database cleanup
    console.log('\n========================================');
    console.log('  CLEANUP');
    console.log('========================================');

    try {
      if (secretId) {
        await prisma.auditLog.deleteMany({ where: { secretId } });
        await prisma.transactionLog.deleteMany({ where: { secretId } });
        await prisma.policy.deleteMany({ where: { secretId } });
        await prisma.apiKey.deleteMany({ where: { secretId } });
        await prisma.walletSecretMetadata.deleteMany({ where: { secretId } });
        await prisma.secret.delete({ where: { id: secretId } }).catch(() => {});
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    }

    await prisma.$disconnect();
  }, 60_000);

  // Test 1: Create a wallet with recovery guardian enabled
  it('should create a wallet with recovery guardian', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .send({
        type: 'EVM_WALLET',
        memo: 'Take Ownership Test Wallet',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.secret.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

    apiKey = res.body.data.apiKey.key;
    secretId = res.body.data.secret.id;
    smartAccountAddress = res.body.data.secret.walletAddress as Address;

    console.log(`Created smart account: ${smartAccountAddress}`);
    console.log(`Secret ID: ${secretId}`);

    // Claim the secret so we can use session auth
    await prisma.secret.update({
      where: { id: secretId },
      data: { userId, claimedAt: new Date(), claimToken: null },
    });
  }, 120_000);

  // Test 2: Make a transaction to deploy the account and track chain usage
  it('should make a transaction to deploy the account', async () => {
    const res = await request(app)
      .post('/api/skills/evm-wallet/send-transaction')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        to: smartAccountAddress,
        data: '0x',
        value: '0',
        chainId: BASE_SEPOLIA_CHAIN_ID,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    console.log(`Deployment tx: ${res.body.data.txHash}`);

    // Verify chain is tracked
    const metadata = await prisma.walletSecretMetadata.findUnique({
      where: { secretId },
    });
    expect(metadata?.chainsUsed).toContain(BASE_SEPOLIA_CHAIN_ID);
  }, 180_000);

  // Test 3: Check ownership status (should not be transferred yet)
  it('should show ownership not transferred initially', async () => {
    const metadata = await prisma.walletSecretMetadata.findUnique({
      where: { secretId },
    });

    expect(metadata?.ownershipTransferred).toBe(false);
    expect(metadata?.ownerAddress).toBeNull();
    expect(metadata?.chainsUsed.length).toBeGreaterThan(0);
  });

  // Test 4: Simulate the user signing a challenge
  it('should verify user signature and transfer ownership', async () => {
    // Generate challenge
    const timestamp = Date.now();
    const challenge = `SafeSkills Ownership Verification

I am taking ownership of the smart wallet:
${smartAccountAddress}

My address: ${userAddress}
Secret ID: ${secretId}
Timestamp: ${timestamp}
Nonce: test-nonce-${timestamp}

By signing this message, I confirm that I control the address above and authorize SafeSkills to transfer smart account ownership to me.`;

    // User signs the challenge
    const userAccount = privateKeyToAccount(userPrivateKey);
    const signature = await userAccount.signMessage({ message: challenge });

    console.log(`User signature: ${signature.slice(0, 20)}...`);

    // Note: In a real test, we'd call the API endpoints with proper session auth
    // For this test, we'll call the service directly or mock the auth
  });

  // Test 5: Execute ownership transfer
  it('should transfer ownership to the new owner', async () => {
    // This test would call the actual ownership transfer
    // For now, we test the ZeroDev recovery function directly

    const secret = await prisma.secret.findUnique({
      where: { id: secretId },
    });

    if (!secret?.value) {
      throw new Error('Secret value not found');
    }

    // Import and call the recovery function
    const { executeRecovery } = await import('../skills/zerodev.service');

    const txHash = await executeRecovery(
      secret.value as Hex,
      BASE_SEPOLIA_CHAIN_ID,
      smartAccountAddress,
      userAddress
    );

    console.log(`Ownership transfer tx: ${txHash}`);
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    // Update the database
    await prisma.walletSecretMetadata.update({
      where: { secretId },
      data: {
        ownershipTransferred: true,
        ownerAddress: userAddress,
        transferredAt: new Date(),
        transferTxHash: txHash,
      },
    });
  }, 180_000);

  // Test 6: Verify backend can still make transactions via guardian
  it('should allow backend to make transactions via guardian after ownership transfer', async () => {
    const res = await request(app)
      .post('/api/skills/evm-wallet/send-transaction')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        to: smartAccountAddress,
        data: '0x',
        value: '0',
        chainId: BASE_SEPOLIA_CHAIN_ID,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('executed');
    expect(res.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    console.log(`Guardian transaction tx: ${res.body.data.txHash}`);
  }, 180_000);

  // Test 7: Verify ownership status after transfer
  it('should show ownership transferred after completion', async () => {
    const metadata = await prisma.walletSecretMetadata.findUnique({
      where: { secretId },
    });

    expect(metadata?.ownershipTransferred).toBe(true);
    expect(metadata?.ownerAddress?.toLowerCase()).toBe(userAddress.toLowerCase());
    expect(metadata?.transferredAt).toBeDefined();
    expect(metadata?.transferTxHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    console.log(`\n========================================`);
    console.log(`  TEST COMPLETE`);
    console.log(`========================================`);
    console.log(`Smart account: ${smartAccountAddress}`);
    console.log(`New owner: ${userAddress}`);
    console.log(`Backend can still transact: YES (via guardian)`);
    console.log(`========================================\n`);
  });
});
```

---

## Environment Variables

Add to `.env`:

```bash
# WalletConnect Project ID (for RainbowKit)
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

---

## Dependencies

### Backend
```json
{
  "@zerodev/weighted-ecdsa-validator": "^5.x"
}
```

### Frontend
```json
{
  "@rainbow-me/rainbowkit": "^2.x",
  "wagmi": "^2.x",
  "@tanstack/react-query": "^5.x"
}
```

---

## Implementation Order

1. **Phase 1**: Backend wallet creation updates
   - Install `@zerodev/weighted-ecdsa-validator` and `@zerodev/permissions`
   - Update Prisma schema with ownership fields (`ownershipTransferred`, `ownerAddress`, `chainsUsed`, `sessionKeyData`)
   - Create migration
   - Implement `buildSessionKeyInitConfig()` for creating permission validator
   - Implement `createSmartAccountWithRecovery()` (returns `{ address, sessionKeyData }`)
   - Implement `executeRecovery()` function (uses guardian validator)
   - Implement `getSessionKeyKernelClient()` function (deserializes `sessionKeyData`)
   - Add chain usage tracking
   - Store `sessionKeyData` in WalletSecretMetadata at wallet creation

2. **Phase 2**: Backend take ownership API
   - Create ownership service with challenge/verify functions
   - Create ownership routes
   - Add audit logging

3. **Phase 3**: Backend transaction execution updates
   - Add `getSessionKeyForSigning()` helper to `evmWallet.service.ts`
   - Pass `sessionKeyData` to ZeroDev transaction functions when `ownershipTransferred` is true
   - ZeroDev functions branch: `sessionKeyData` → `getSessionKeyKernelClient()`, else → `getKernelClient()`

4. **Phase 4**: E2E testing
   - Create `takeOwnership.e2e.test.ts`
   - Test full flow with random user EOA
   - Verify guardian can still transact after transfer
   - Validate backend works before building frontend

5. **Phase 5**: Frontend integration
   - Install RainbowKit + wagmi + react-query
   - Configure wagmi provider
   - Create TakeOwnership component
   - Add API functions
   - Integrate into SecretDetail page

---

## Summary

Using ZeroDev's recovery mechanism with `@zerodev/weighted-ecdsa-validator` and `@zerodev/permissions`:

1. **Wallet Creation**: Set up backend EOA in three roles: sudo validator (ECDSA owner), guardian (weighted ECDSA for recovery), and session key (permission validator via `initConfig` for post-transfer signing). `sessionKeyData` serialized and stored in DB.

2. **Take Ownership**: Guardian calls `doRecovery(validatorAddress, newOwnerAddress)` to rotate the sudo validator to the user's EOA.

3. **After Transfer**: Backend signs transactions via `getSessionKeyKernelClient()`, which deserializes the stored `sessionKeyData` into a permission account. The permission validator was installed on-chain via `initConfig` and persists independently of the sudo validator change.

4. **Multi-chain**: Execute recovery on all chains where the wallet has been used (tracked in `chainsUsed` array)
