import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  constants,
  addressToEmptyAccount,
} from '@zerodev/sdk';
import {
  signerToEcdsaValidator,
  getValidatorAddress as getEcdsaValidatorAddress,
} from '@zerodev/ecdsa-validator';
import { createWeightedECDSAValidator, getRecoveryAction } from '@zerodev/weighted-ecdsa-validator';
import {
  toPermissionValidator,
  toInitConfig,
  serializePermissionAccount,
  deserializePermissionAccount,
} from '@zerodev/permissions';
import { toSudoPolicy } from '@zerodev/permissions/policies';
import { toECDSASigner } from '@zerodev/permissions/signers';
import {
  http,
  createPublicClient,
  type Hex,
  type Address,
  type Hash,
  encodeFunctionData,
  parseAbi,
  formatEther,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { type Chain } from 'viem/chains';
import * as chains from 'viem/chains';
import { env } from '../utils/env.js';
import { AppError } from '../api/middleware/errorHandler.js';

const entryPoint = constants.getEntryPoint('0.7');
const kernelVersion = constants.KERNEL_V3_1;

// ============================================================
// Error Handling
// ============================================================

/**
 * Error codes for transaction failures that can help with debugging.
 */
export const TX_ERROR_CODES = {
  SIMULATION_FAILED: 'TX_SIMULATION_FAILED',
  PAYMASTER_FAILED: 'PAYMASTER_FAILED',
  BUNDLER_FAILED: 'BUNDLER_FAILED',
  USER_OP_FAILED: 'USER_OP_FAILED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  UNKNOWN: 'TX_UNKNOWN_ERROR',
} as const;

/**
 * Extract the clean, human-readable error reason from verbose RPC/bundler errors.
 * These errors often contain lots of noise (URLs, request bodies, etc.) but the
 * actual reason is typically in a "Details:" or "reason:" section.
 */
function extractCleanErrorReason(errorMessage: string): string | null {
  // Pattern 1: "Details: ... with reason: <actual error>"
  // e.g., "Details: UserOperation reverted during simulation with reason: ERC20: transfer amount exceeds allowance"
  const detailsReasonMatch = errorMessage.match(
    /Details:\s*(?:UserOperation\s+)?(?:reverted\s+)?(?:during\s+simulation\s+)?with\s+reason:\s*([^\n]+)/i
  );
  if (detailsReasonMatch) {
    return detailsReasonMatch[1].trim();
  }

  // Pattern 2: "reason: <actual error>" (generic)
  const reasonMatch = errorMessage.match(/reason:\s*([^\n"']+)/i);
  if (reasonMatch) {
    const reason = reasonMatch[1].trim();
    // Don't return if it's just a continuation of other text
    if (reason.length > 3 && !reason.startsWith('http')) {
      return reason;
    }
  }

  // Pattern 3: "reverted with: <actual error>" or "revert <actual error>"
  const revertMatch = errorMessage.match(/revert(?:ed)?(?:\s+with)?[:\s]+([^"\n]+?)(?:\n|$)/i);
  if (revertMatch) {
    const reason = revertMatch[1].trim();
    // Filter out noise like "during simulation" without an actual reason
    if (reason.length > 5 && !reason.toLowerCase().startsWith('during simulation')) {
      return reason;
    }
  }

  // Pattern 4: Common ERC20/ERC721 errors that might appear anywhere
  const commonErrors = [
    /ERC20:\s*([^\n"']+)/i,
    /ERC721:\s*([^\n"']+)/i,
    /Ownable:\s*([^\n"']+)/i,
    /SafeMath:\s*([^\n"']+)/i,
    /execution reverted:\s*([^\n"']+)/i,
  ];
  for (const pattern of commonErrors) {
    const match = errorMessage.match(pattern);
    if (match) {
      return match[0].trim(); // Return the full match including prefix (e.g., "ERC20: ...")
    }
  }

  // Pattern 5: AA (Account Abstraction) error codes with description
  const aaMatch = errorMessage.match(/AA(\d+)\s*([^\n"']*)/);
  if (aaMatch) {
    return `AA${aaMatch[1]}${aaMatch[2] ? ': ' + aaMatch[2].trim() : ''}`;
  }

  return null;
}

/**
 * Parse ZeroDev/bundler errors to extract meaningful information.
 * Prioritizes extracting the actual error reason over categorizing by error source.
 */
function parseTransactionError(error: unknown): {
  code: string;
  message: string;
  details: Record<string, unknown>;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();

  // Common error patterns from bundlers and paymasters
  const details: Record<string, unknown> = {
    originalError: errorMessage,
  };

  // First, try to extract the clean error reason from verbose messages
  const cleanReason = extractCleanErrorReason(errorMessage);
  if (cleanReason) {
    details.revertReason = cleanReason;
  }

  // Check for simulation/revert failures FIRST (most common case)
  // These often appear in paymaster responses but the root cause is contract revert
  if (
    errorString.includes('reverted') ||
    errorString.includes('revert') ||
    errorString.includes('simulation') ||
    errorString.includes('execution failed')
  ) {
    // If we found a clean reason, use it; otherwise provide generic message
    const userMessage = cleanReason || 'execution would revert';

    return {
      code: TX_ERROR_CODES.SIMULATION_FAILED,
      message: `Transaction reverted: ${userMessage}`,
      details,
    };
  }

  // Insufficient funds (check before paymaster since paymaster errors might mention balance)
  if (
    errorString.includes('insufficient') ||
    (errorString.includes('balance') && !errorString.includes('allowance'))
  ) {
    return {
      code: TX_ERROR_CODES.INSUFFICIENT_FUNDS,
      message: cleanReason
        ? `Insufficient funds: ${cleanReason}`
        : 'Insufficient funds for transaction',
      details,
    };
  }

  // True paymaster errors (not containing revert reasons)
  // Only classify as paymaster error if there's no revert reason extracted
  if (
    !cleanReason &&
    (errorString.includes('paymaster') ||
      errorString.includes('sponsor') ||
      errorString.includes('gas policy'))
  ) {
    return {
      code: TX_ERROR_CODES.PAYMASTER_FAILED,
      message: 'Paymaster rejected transaction (may be out of gas credits or unsupported chain)',
      details,
    };
  }

  // Bundler errors (only if no specific reason found)
  if (!cleanReason && (errorString.includes('bundler') || errorString.includes('userop'))) {
    return {
      code: TX_ERROR_CODES.BUNDLER_FAILED,
      message: 'Bundler rejected user operation',
      details,
    };
  }

  // AA (Account Abstraction) errors with specific codes
  const aaErrorMatch = errorMessage.match(/AA(\d+)/);
  if (aaErrorMatch) {
    details.aaErrorCode = `AA${aaErrorMatch[1]}`;
    const aaMessage = cleanReason || `AA${aaErrorMatch[1]} error`;
    return {
      code: TX_ERROR_CODES.USER_OP_FAILED,
      message: `User operation failed: ${aaMessage}`,
      details,
    };
  }

  // Default: use clean reason if found, otherwise truncate the verbose message
  return {
    code: TX_ERROR_CODES.UNKNOWN,
    message: cleanReason
      ? `Transaction failed: ${cleanReason}`
      : 'Transaction failed (unknown error)',
    details,
  };
}

/**
 * Wrap transaction execution with enhanced error handling.
 */
async function executeWithEnhancedErrors<T>(
  operation: () => Promise<T>,
  context: { chainId: number; to?: Address; value?: bigint }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const parsed = parseTransactionError(error);

    // Log detailed error for debugging
    console.error(
      '[TX_ERROR]',
      JSON.stringify({
        code: parsed.code,
        message: parsed.message,
        chainId: context.chainId,
        to: context.to,
        value: context.value?.toString(),
        details: parsed.details,
      })
    );

    throw new AppError(parsed.code, parsed.message, 500, {
      ...parsed.details,
      chainId: context.chainId,
      to: context.to,
      value: context.value?.toString(),
    });
  }
}

// Build chain lookup from all viem chains
const CHAIN_MAP: Record<number, Chain> = {};
for (const value of Object.values(chains)) {
  if (value && typeof value === 'object' && 'id' in value && 'name' in value) {
    CHAIN_MAP[(value as Chain).id] = value as Chain;
  }
}

function getBundlerUrl(projectId: string, chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}

function getPaymasterUrl(projectId: string, chainId: number): string {
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}

function getChain(chainId: number): Chain {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}. No matching chain found in viem.`);
  }
  return chain;
}

function getPublicClient(chainId: number) {
  const chain = getChain(chainId);
  const projectId = env.ZERODEV_PROJECT_ID;
  // Use ZeroDev RPC when available (default public RPCs are heavily rate-limited)
  const rpcUrl = projectId ? getBundlerUrl(projectId, chainId) : undefined;
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

// ERC20 ABI fragments
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

/**
 * Create a ZeroDev smart account from an EOA private key.
 * Returns the smart account address.
 */
export async function createSmartAccount(privateKey: Hex, chainId: number): Promise<Address> {
  const projectId = env.ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('ZERODEV_PROJECT_ID is not configured');
  }

  const publicClient = getPublicClient(chainId);
  const signer = privateKeyToAccount(privateKey);

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  });

  return account.address;
}

/**
 * Build the session key permission plugin initConfig for a given signer address.
 * This must be identical to what was used during account creation so the
 * counterfactual address (CREATE2) matches.
 */
async function buildSessionKeyInitConfig(
  signerAddress: Address,
  publicClient: ReturnType<typeof getPublicClient>
) {
  const emptySessionKeySigner = await toECDSASigner({
    signer: addressToEmptyAccount(signerAddress),
  });

  const permissionPlugin = await toPermissionValidator(publicClient, {
    signer: emptySessionKeySigner,
    policies: [toSudoPolicy({})],
    entryPoint,
    kernelVersion,
  });

  return { initConfig: await toInitConfig(permissionPlugin), permissionPlugin };
}

/**
 * Build a kernel account client for executing transactions.
 * When smartAccountAddress is provided, reconstructs the initConfig so the
 * initCode matches the counterfactual address (needed for first deployment).
 */
async function getKernelClient(privateKey: Hex, chainId: number, smartAccountAddress?: Address) {
  const projectId = env.ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('ZERODEV_PROJECT_ID is not configured');
  }

  const chain = getChain(chainId);
  const publicClient = getPublicClient(chainId);
  const signer = privateKeyToAccount(privateKey);

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  // When we have a stored address, rebuild the initConfig so the factory
  // deploys to the correct counterfactual address on first use.
  let initConfig: Hex[] | undefined;
  if (smartAccountAddress) {
    const result = await buildSessionKeyInitConfig(signer.address, publicClient);
    initConfig = result.initConfig;
  }

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
    ...(smartAccountAddress && { address: smartAccountAddress, initConfig }),
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

  return { kernelClient, account, publicClient };
}

// ============================================================
// Transaction Execution
// ============================================================

export interface TransferParams {
  privateKey: Hex;
  chainId: number;
  to: Address;
  value?: bigint;
  tokenAddress?: Address;
  tokenAmount?: bigint;
  /** Serialized session key data for signing after ownership transfer. When provided, smartAccountAddress is ignored. */
  sessionKeyData?: string;
  /** The existing smart account address for reconstructing initConfig. Only used when sessionKeyData is not provided. */
  smartAccountAddress?: Address;
}

export interface TransferResult {
  txHash: Hash;
  smartAccountAddress: Address;
}

/**
 * Execute a transfer (ETH or ERC20) via ZeroDev smart account.
 * If sessionKeyData is provided, uses the session key (permission validator) for signing.
 */
export async function executeTransfer(params: TransferParams): Promise<TransferResult> {
  const {
    privateKey,
    chainId,
    to,
    value,
    tokenAddress,
    tokenAmount,
    sessionKeyData,
    smartAccountAddress,
  } = params;

  // Get appropriate kernel client based on mode
  const { kernelClient, account } = sessionKeyData
    ? await getSessionKeyKernelClient(privateKey, chainId, sessionKeyData)
    : await getKernelClient(privateKey, chainId, smartAccountAddress);

  const txHash = await executeWithEnhancedErrors(
    async () => {
      if (tokenAddress && tokenAmount !== undefined) {
        // ERC20 transfer
        const callData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [to, tokenAmount],
        });

        return kernelClient.sendTransaction({
          to: tokenAddress,
          data: callData,
          value: 0n,
        });
      } else {
        // Native ETH transfer
        return kernelClient.sendTransaction({
          to,
          value: value ?? 0n,
          data: '0x',
        });
      }
    },
    { chainId, to: tokenAddress ?? to, value: value ?? tokenAmount }
  );

  return {
    txHash,
    smartAccountAddress: account.address,
  };
}

export interface SendTransactionParams {
  privateKey: Hex;
  chainId: number;
  to: Address;
  data: Hex;
  value?: bigint;
  /** Serialized session key data for signing after ownership transfer. When provided, smartAccountAddress is ignored. */
  sessionKeyData?: string;
  /** The existing smart account address for reconstructing initConfig. Only used when sessionKeyData is not provided. */
  smartAccountAddress?: Address;
}

export interface SendTransactionResult {
  txHash: Hash;
  smartAccountAddress: Address;
}

/**
 * Execute an arbitrary transaction via ZeroDev smart account.
 * If sessionKeyData is provided, uses the session key (permission validator) for signing.
 */
export async function executeSendTransaction(
  params: SendTransactionParams
): Promise<SendTransactionResult> {
  const { privateKey, chainId, to, data, value, sessionKeyData, smartAccountAddress } = params;

  // Get appropriate kernel client based on mode
  const { kernelClient, account } = sessionKeyData
    ? await getSessionKeyKernelClient(privateKey, chainId, sessionKeyData)
    : await getKernelClient(privateKey, chainId, smartAccountAddress);

  const txHash = await executeWithEnhancedErrors(
    async () =>
      kernelClient.sendTransaction({
        to,
        data,
        value: value ?? 0n,
      }),
    { chainId, to, value }
  );

  return {
    txHash,
    smartAccountAddress: account.address,
  };
}

export interface BatchSendTransactionParams {
  privateKey: Hex;
  chainId: number;
  calls: Array<{
    to: Address;
    data: Hex;
    value: bigint;
  }>;
  /** Serialized session key data for signing after ownership transfer. When provided, smartAccountAddress is ignored. */
  sessionKeyData?: string;
  /** The existing smart account address for reconstructing initConfig. Only used when sessionKeyData is not provided. */
  smartAccountAddress?: Address;
}

/**
 * Execute a batch of transactions via ZeroDev smart account (UserOp batching).
 * Uses sendUserOperation with calls array for atomic batching.
 * If sessionKeyData is provided, uses the session key (permission validator) for signing.
 */
export async function executeBatchTransaction(
  params: BatchSendTransactionParams
): Promise<SendTransactionResult> {
  const { privateKey, chainId, calls, sessionKeyData, smartAccountAddress } = params;

  // Get appropriate kernel client based on mode
  const { kernelClient, account } = sessionKeyData
    ? await getSessionKeyKernelClient(privateKey, chainId, sessionKeyData)
    : await getKernelClient(privateKey, chainId, smartAccountAddress);

  const txHash = await executeWithEnhancedErrors(
    async () => {
      // ZeroDev's sendTransaction accepts SendUserOperationParameters with a `calls` array
      // which batches multiple calls into a single UserOperation
      return kernelClient.sendTransaction({
        calls: calls.map((c) => ({
          to: c.to,
          data: c.data,
          value: c.value,
        })),
      } as any);
    },
    {
      chainId,
      to: calls[0]?.to,
      value: calls.reduce((sum, c) => sum + c.value, 0n),
    }
  );

  return {
    txHash,
    smartAccountAddress: account.address,
  };
}

// ============================================================
// Read-Only Functions
// ============================================================

export async function getEthBalance(
  address: Address,
  chainId: number
): Promise<{ balance: string; balanceWei: string }> {
  const publicClient = getPublicClient(chainId);
  const balanceWei = await publicClient.getBalance({ address });

  return {
    balance: formatEther(balanceWei),
    balanceWei: balanceWei.toString(),
  };
}

export async function getErc20Balance(
  address: Address,
  tokenAddress: Address,
  chainId: number
): Promise<{ balance: string; balanceRaw: string; decimals: number; symbol: string }> {
  const publicClient = getPublicClient(chainId);

  const [balanceRaw, decimals, symbol] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'symbol',
    }),
  ]);

  return {
    balance: formatUnits(balanceRaw, decimals),
    balanceRaw: balanceRaw.toString(),
    decimals,
    symbol,
  };
}

export async function getTokenDecimals(tokenAddress: Address, chainId: number): Promise<number> {
  const publicClient = getPublicClient(chainId);
  return publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });
}

export async function getTokenSymbol(tokenAddress: Address, chainId: number): Promise<string> {
  const publicClient = getPublicClient(chainId);
  return publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
  });
}

// ============================================================
// Recovery-Enabled Wallet Functions
// ============================================================

/**
 * Create a ZeroDev smart account with recovery guardian enabled.
 * The backend EOA is set up as:
 * - Sudo validator (initial owner) via ECDSA validator
 * - Weighted ECDSA guardian (can execute recovery)
 * - Permission validator with sudo policy (session key for post-transfer signing)
 *
 * The permission validator is installed via initConfig so it persists on-chain
 * independently of the sudo validator. After ownership transfer, the backend
 * can sign transactions using the session key (permission validator) instead
 * of the guardian (which only works for the recovery action).
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
    kernelVersion,
    config: {
      threshold: 100,
      signers: [{ address: signer.address, weight: 100 }],
    },
    signers: [signer],
  });

  // 3. Create permission validator (session key) with sudo policy for the backend EOA
  const { initConfig, permissionPlugin } = await buildSessionKeyInitConfig(
    signer.address,
    publicClient
  );

  // 4. Create kernel account with sudo, guardian, recovery action, and session key via initConfig
  const account = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: ecdsaValidator,
      regular: guardianValidator,
      action: getRecoveryAction(entryPoint.version),
    },
    initConfig,
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
 *
 * This uses the weighted ECDSA guardian validator to call doRecovery(),
 * which changes the sudo validator to be controlled by the new owner's address.
 */
export async function executeRecovery(
  privateKey: Hex, // Backend EOA (guardian)
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
    kernelVersion,
    config: {
      threshold: 100,
      signers: [{ address: signer.address, weight: 100 }],
    },
    signers: [signer],
  });

  // Create account instance with guardian as the active validator
  // and the recovery action enabled so we can call doRecovery
  const account = await createKernelAccount(publicClient, {
    address: smartAccountAddress,
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: guardianValidator, // Guardian is signing this recovery UserOp
      regular: guardianValidator,
      action: getRecoveryAction(entryPoint.version),
    },
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
  // The doRecovery function takes (validatorAddress, newOwnerData) where:
  // - validatorAddress: the address of the validator type (ECDSA validator)
  // - newOwnerData: the new owner's address encoded as bytes
  const recoveryExecutorAbi = parseAbi([
    'function doRecovery(address _validator, bytes calldata _data)',
  ]);

  // Get the ECDSA validator address that the new owner will use
  const ecdsaValidatorAddress = getEcdsaValidatorAddress(entryPoint, kernelVersion);

  const userOpHash = await kernelClient.sendUserOperation({
    callData: encodeFunctionData({
      abi: recoveryExecutorAbi,
      functionName: 'doRecovery',
      args: [
        ecdsaValidatorAddress,
        newOwnerAddress, // New owner's address encoded as bytes
      ],
    }),
  });

  // Wait for confirmation
  const bundlerClient = kernelClient.extend(() => ({}));
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt.receipt.transactionHash;
}

/**
 * Get a kernel client using the session key (permission validator) for transactions
 * after ownership transfer. This allows the backend to continue signing transactions
 * even after the user takes ownership of the smart account.
 *
 * After ownership transfer:
 * - The user's EOA is the sudo validator (owner)
 * - The backend's EOA signs via the permission validator (session key with sudo policy)
 *
 * The permission validator was installed via initConfig during account creation
 * and persists on-chain independently of the sudo validator.
 */
async function getSessionKeyKernelClient(privateKey: Hex, chainId: number, sessionKeyData: string) {
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
