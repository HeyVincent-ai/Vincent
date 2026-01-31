import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  constants,
} from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
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
import { env } from '../utils/env';

const entryPoint = constants.getEntryPoint('0.7');
const kernelVersion = constants.KERNEL_V3_1;

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
export async function createSmartAccount(
  privateKey: Hex,
  chainId: number
): Promise<Address> {
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
 * Build a kernel account client for executing transactions.
 */
async function getKernelClient(privateKey: Hex, chainId: number) {
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

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
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
}

export interface TransferResult {
  txHash: Hash;
  smartAccountAddress: Address;
}

/**
 * Execute a transfer (ETH or ERC20) via ZeroDev smart account.
 */
export async function executeTransfer(params: TransferParams): Promise<TransferResult> {
  const { privateKey, chainId, to, value, tokenAddress, tokenAmount } = params;
  const { kernelClient, account } = await getKernelClient(privateKey, chainId);

  let txHash: Hash;

  if (tokenAddress && tokenAmount !== undefined) {
    // ERC20 transfer
    const callData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, tokenAmount],
    });

    txHash = await kernelClient.sendTransaction({
      to: tokenAddress,
      data: callData,
      value: 0n,
    });
  } else {
    // Native ETH transfer
    txHash = await kernelClient.sendTransaction({
      to,
      value: value ?? 0n,
      data: '0x',
    });
  }

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
}

export interface SendTransactionResult {
  txHash: Hash;
  smartAccountAddress: Address;
}

/**
 * Execute an arbitrary transaction via ZeroDev smart account.
 */
export async function executeSendTransaction(
  params: SendTransactionParams
): Promise<SendTransactionResult> {
  const { privateKey, chainId, to, data, value } = params;
  const { kernelClient, account } = await getKernelClient(privateKey, chainId);

  const txHash = await kernelClient.sendTransaction({
    to,
    data,
    value: value ?? 0n,
  });

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

export async function getTokenDecimals(
  tokenAddress: Address,
  chainId: number
): Promise<number> {
  const publicClient = getPublicClient(chainId);
  return publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });
}
