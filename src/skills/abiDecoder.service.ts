/**
 * ABI Decoder Service
 *
 * Fetches contract ABIs from Sourcify (primary) and block explorers (fallback),
 * then decodes transaction calldata to show human-readable function calls.
 */

import { type Abi, type Address, decodeFunctionData, formatUnits } from 'viem';
import { env } from '../utils/env';

// ============================================================
// Types
// ============================================================

export interface DecodedTransaction {
  functionName: string;
  args: DecodedArg[];
  /** Raw function signature like "transfer(address,uint256)" */
  signature?: string;
}

export interface DecodedArg {
  name: string;
  type: string;
  value: string;
}

interface CacheEntry {
  abi: Abi | null;
  fetchedAt: number;
}

// ============================================================
// Configuration
// ============================================================

// Sourcify API endpoints (primary source - free, no API key needed)
const SOURCIFY_API = 'https://sourcify.dev/server';

// Block explorer API endpoints for ABI fetching (fallback)
// These are Etherscan-compatible APIs that support the ?module=contract&action=getabi endpoint
const EXPLORER_API_URLS: Record<number, string> = {
  // Mainnets
  1: 'https://api.etherscan.io/api',
  137: 'https://api.polygonscan.com/api',
  42161: 'https://api.arbiscan.io/api',
  10: 'https://api-optimistic.etherscan.io/api',
  8453: 'https://api.basescan.org/api',
  43114: 'https://api.snowtrace.io/api',
  56: 'https://api.bscscan.com/api',
  59144: 'https://api.lineascan.build/api',
  534352: 'https://api.scrollscan.com/api',
  81457: 'https://api.blastscan.io/api',
  // Testnets
  11155111: 'https://api-sepolia.etherscan.io/api',
  5: 'https://api-goerli.etherscan.io/api',
  80002: 'https://api-amoy.polygonscan.com/api',
  80001: 'https://api-testnet.polygonscan.com/api',
  421614: 'https://api-sepolia.arbiscan.io/api',
  421613: 'https://api-goerli.arbiscan.io/api',
  11155420: 'https://api-sepolia-optimistic.etherscan.io/api',
  84532: 'https://api-sepolia.basescan.org/api',
};

// ABI cache (in-memory, with TTL)
const abiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (ABIs don't change)
const CACHE_TTL_NOT_FOUND_MS = 60 * 60 * 1000; // 1 hour for "not found" entries

// ============================================================
// ABI Fetching
// ============================================================

/**
 * Get ABI for a contract address on a given chain.
 * Tries Sourcify first (free), then falls back to block explorers.
 */
export async function getContractAbi(address: Address, chainId: number): Promise<Abi | null> {
  const cacheKey = `${chainId}:${address.toLowerCase()}`;

  // Check cache
  const cached = abiCache.get(cacheKey);
  if (cached) {
    const ttl = cached.abi ? CACHE_TTL_MS : CACHE_TTL_NOT_FOUND_MS;
    if (Date.now() - cached.fetchedAt < ttl) {
      return cached.abi;
    }
  }

  // Try Sourcify first (free, no API key required)
  let abi = await fetchFromSourcify(address, chainId);

  // Fall back to block explorer if Sourcify doesn't have it
  if (!abi && env.ETHERSCAN_API_KEY) {
    abi = await fetchFromExplorer(address, chainId);
  }

  // Cache the result (including null for "not found")
  abiCache.set(cacheKey, { abi, fetchedAt: Date.now() });

  return abi;
}

/**
 * Fetch ABI from Sourcify's API.
 * Sourcify stores verified contract source code and ABIs for many chains.
 */
async function fetchFromSourcify(address: Address, chainId: number): Promise<Abi | null> {
  // Try full match first, then partial match
  const matchTypes = ['full_match', 'partial_match'];

  for (const matchType of matchTypes) {
    try {
      const url = `${SOURCIFY_API}/files/${matchType}/${chainId}/${address}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) continue;

      // Sourcify returns a list of files; we need metadata.json which contains the ABI
      const files = (await response.json()) as Array<{ name: string; content: string }>;
      const metadataFile = files.find((f) => f.name === 'metadata.json');

      if (metadataFile) {
        const metadata = JSON.parse(metadataFile.content);
        if (metadata.output?.abi) {
          return metadata.output.abi as Abi;
        }
      }
    } catch {
      // Sourcify request failed, try next match type or fall through
    }
  }

  return null;
}

/**
 * Fetch ABI from an Etherscan-compatible block explorer API.
 */
async function fetchFromExplorer(address: Address, chainId: number): Promise<Abi | null> {
  const apiUrl = EXPLORER_API_URLS[chainId];
  if (!apiUrl || !env.ETHERSCAN_API_KEY) return null;

  try {
    const url = new URL(apiUrl);
    url.searchParams.set('module', 'contract');
    url.searchParams.set('action', 'getabi');
    url.searchParams.set('address', address);
    url.searchParams.set('apikey', env.ETHERSCAN_API_KEY);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { status: string; result: string };

    if (data.status === '1' && data.result) {
      return JSON.parse(data.result) as Abi;
    }
  } catch {
    // Explorer request failed
  }

  return null;
}

// ============================================================
// Transaction Decoding
// ============================================================

/**
 * Decode transaction calldata using the contract's ABI.
 * Returns null if ABI is unavailable or decoding fails.
 */
export async function decodeTransaction(
  to: Address,
  data: string,
  chainId: number
): Promise<DecodedTransaction | null> {
  if (!data || data === '0x' || data.length < 10) {
    return null;
  }

  try {
    const abi = await getContractAbi(to, chainId);
    if (!abi) return null;

    const decoded = decodeFunctionData({
      abi,
      data: data as `0x${string}`,
    });

    // Find the function definition to get parameter names and types
    const funcDef = abi.find(
      (item): item is Extract<typeof item, { type: 'function' }> =>
        item.type === 'function' && item.name === decoded.functionName
    );

    if (!funcDef || !funcDef.inputs) {
      return {
        functionName: decoded.functionName,
        args: (decoded.args ?? []).map((arg, i) => ({
          name: `arg${i}`,
          type: 'unknown',
          value: formatArgValue(arg),
        })),
      };
    }

    // Build the function signature
    const signature = `${decoded.functionName}(${funcDef.inputs.map((i) => i.type).join(',')})`;

    // Map args to their names and types
    const args: DecodedArg[] = (decoded.args ?? []).map((arg, i) => ({
      name: funcDef.inputs[i]?.name || `arg${i}`,
      type: funcDef.inputs[i]?.type || 'unknown',
      value: formatArgValue(arg, funcDef.inputs[i]?.type),
    }));

    return {
      functionName: decoded.functionName,
      args,
      signature,
    };
  } catch {
    // Decoding failed (e.g., function not in ABI, or corrupt data)
    return null;
  }
}

/**
 * Format an argument value for display.
 * Handles addresses, numbers, arrays, and other types.
 */
function formatArgValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  // BigInt values
  if (typeof value === 'bigint') {
    // If it looks like a token amount (uint256), try to format it nicely
    if (type === 'uint256' || type === 'uint128') {
      // Show raw value for very small numbers, formatted for large ones
      if (value < 1_000_000n) {
        return value.toString();
      }
      // Try common decimal formats (18, 8, 6)
      const str = value.toString();
      if (str.length > 18) {
        return `${formatUnits(value, 18)} (raw: ${str})`;
      }
      return str;
    }
    return value.toString();
  }

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) {
      return `[${value.map((v) => formatArgValue(v)).join(', ')}]`;
    }
    return `[${value.length} items]`;
  }

  // Addresses (keep full address for clarity)
  if (typeof value === 'string' && value.startsWith('0x') && value.length === 42) {
    return value;
  }

  // Bytes
  if (typeof value === 'string' && value.startsWith('0x')) {
    if (value.length <= 66) return value;
    return `${value.slice(0, 10)}...${value.slice(-8)} (${(value.length - 2) / 2} bytes)`;
  }

  // Objects (structs/tuples)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }

  // Booleans and strings
  return String(value);
}

// ============================================================
// Utility Functions
// ============================================================

export interface FormatOptions {
  /** Maximum number of arguments to display (default: 5) */
  maxArgs?: number;
  /** Maximum length for argument values before truncation (default: 40) */
  maxValueLength?: number;
  /** Whether to include the *Parameters:* header (default: true) */
  includeHeader?: boolean;
}

/**
 * Format decoded transaction parameters for display in Telegram messages.
 * Returns an array of lines to be joined with the caller's message.
 */
export function formatDecodedTxForTelegram(
  decoded: DecodedTransaction,
  options: FormatOptions = {}
): string[] {
  const { maxArgs = 5, maxValueLength = 40, includeHeader = true } = options;
  const lines: string[] = [];

  if (decoded.args.length === 0) {
    return lines;
  }

  if (includeHeader) {
    lines.push('*Parameters:*');
  }

  const displayArgs = decoded.args.slice(0, maxArgs);
  for (const arg of displayArgs) {
    const name = arg.name || 'unnamed';
    let displayValue = arg.value;
    // Truncate long values for readability
    if (displayValue.length > maxValueLength) {
      displayValue = displayValue.slice(0, maxValueLength - 3) + '...';
    }
    lines.push(`  ${name}: \`${displayValue}\``);
  }

  if (decoded.args.length > maxArgs) {
    lines.push(`  ... and ${decoded.args.length - maxArgs} more`);
  }

  return lines;
}

/**
 * Get just the function selector (first 4 bytes) from calldata.
 */
export function getFunctionSelector(data: string): string | undefined {
  if (data.length >= 10) {
    return data.slice(0, 10);
  }
  return undefined;
}

/**
 * Clear the ABI cache (useful for testing).
 */
export function clearAbiCache(): void {
  abiCache.clear();
}
