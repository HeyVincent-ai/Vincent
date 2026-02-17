import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Hex,
  type Address,
  erc20Abi,
} from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ============================================================
// Constants
// ============================================================

export const USDC_E_ADDRESS: Address = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_DECIMALS = 6;

// ============================================================
// Helpers
// ============================================================

export function getFunderPrivateKey(): Hex {
  const key = process.env.E2E_FUNDER_PRIVATE_KEY;
  if (!key) throw new Error('E2E_FUNDER_PRIVATE_KEY env var is required');
  return key.startsWith('0x') ? (key as Hex) : (`0x${key}` as Hex);
}

export function getPolygonRpcUrl(): string {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyKey) throw new Error('ALCHEMY_API_KEY env var is required');
  return `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`;
}

export async function sendUsdcE(fromPrivateKey: Hex, to: Address, amount: string): Promise<Hex> {
  const account = privateKeyToAccount(fromPrivateKey);
  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const amountWei = parseUnits(amount, USDC_DECIMALS);

  const hash = await client.writeContract({
    address: USDC_E_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amountWei],
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

export async function getUsdcEBalance(address: Address): Promise<string> {
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(getPolygonRpcUrl()),
  });

  const balance = await publicClient.readContract({
    address: USDC_E_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });

  return formatUnits(balance, USDC_DECIMALS);
}

/**
 * Send USDC.e from a Safe wallet. Tries direct execution first, falls back to relayer.
 */
export async function sendUsdcEFromSafe(
  safeOwnerPrivateKey: Hex,
  to: Address,
  amount: string,
  safeAddress: Address
): Promise<string | null> {
  try {
    const account = privateKeyToAccount(safeOwnerPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(getPolygonRpcUrl()),
    });
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(getPolygonRpcUrl()),
    });

    const eoaBalance = await publicClient.getBalance({ address: account.address });
    const minGas = parseUnits('0.01', 18);
    console.log(`EOA MATIC balance: ${formatUnits(eoaBalance, 18)} MATIC`);

    if (eoaBalance < minGas) {
      console.log('EOA has insufficient MATIC for direct Safe execution, trying relayer...');
      return await sendUsdcEFromSafeViaRelayer(safeOwnerPrivateKey, to, amount, safeAddress);
    }

    const safeAbi = [
      'function nonce() view returns (uint256)',
      'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)',
    ] as const;

    const nonce = (await publicClient.readContract({
      address: safeAddress,
      abi: safeAbi,
      functionName: 'nonce',
    })) as bigint;
    console.log(`Safe nonce: ${nonce}`);

    const amountWei = parseUnits(amount, USDC_DECIMALS);
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, amountWei],
    });

    const SAFE_TX_TYPEHASH = '0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8';
    const safeTxData = {
      to: USDC_E_ADDRESS as Address,
      value: 0n,
      data: transferData,
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: '0x0000000000000000000000000000000000000000' as Address,
      refundReceiver: '0x0000000000000000000000000000000000000000' as Address,
      nonce,
    };

    const { keccak256, encodePacked, encodeAbiParameters } = await import('viem');

    const domainSeparator = await publicClient.readContract({
      address: safeAddress,
      abi: [
        {
          name: 'domainSeparator',
          type: 'function',
          inputs: [],
          outputs: [{ type: 'bytes32' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'domainSeparator',
    });

    const safeTxHash = keccak256(
      encodeAbiParameters(
        [
          { type: 'bytes32' }, { type: 'address' }, { type: 'uint256' },
          { type: 'bytes32' }, { type: 'uint8' }, { type: 'uint256' },
          { type: 'uint256' }, { type: 'uint256' }, { type: 'address' },
          { type: 'address' }, { type: 'uint256' },
        ],
        [
          SAFE_TX_TYPEHASH, safeTxData.to, safeTxData.value,
          keccak256(safeTxData.data), safeTxData.operation, safeTxData.safeTxGas,
          safeTxData.baseGas, safeTxData.gasPrice, safeTxData.gasToken,
          safeTxData.refundReceiver, safeTxData.nonce,
        ]
      )
    );

    const txHash = keccak256(
      encodePacked(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        ['0x19', '0x01', domainSeparator, safeTxHash]
      )
    );

    const signature = await walletClient.signMessage({ message: { raw: txHash } });
    const sigBytes = signature.slice(2);
    const r = sigBytes.slice(0, 64);
    const s = sigBytes.slice(64, 128);
    let v = parseInt(sigBytes.slice(128, 130), 16);
    v += 4;
    const adjustedSig = `0x${r}${s}${v.toString(16).padStart(2, '0')}` as Hex;

    console.log(`Executing Safe transaction to transfer ${amount} USDC.e...`);
    const hash = await walletClient.writeContract({
      address: safeAddress,
      abi: safeAbi,
      functionName: 'execTransaction',
      args: [
        safeTxData.to, safeTxData.value, safeTxData.data, safeTxData.operation,
        safeTxData.safeTxGas, safeTxData.baseGas, safeTxData.gasPrice,
        safeTxData.gasToken, safeTxData.refundReceiver, adjustedSig,
      ],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Returned ${amount} USDC.e to funder (tx: ${hash})`);
    return hash;
  } catch (err) {
    console.error('Failed to return funds via direct Safe execution:', err);
    return null;
  }
}

export async function sendUsdcEFromSafeViaRelayer(
  safeOwnerPrivateKey: Hex,
  to: Address,
  amount: string,
  safeAddress: Address
): Promise<string | null> {
  try {
    const { Wallet } = await import('@ethersproject/wallet');
    const { JsonRpcProvider } = await import('@ethersproject/providers');
    const { Interface } = await import('@ethersproject/abi');
    const { RelayClient, RelayerTxType } = await import('@polymarket/builder-relayer-client');
    const { BuilderConfig } = await import('@polymarket/builder-signing-sdk');

    if (
      !process.env.POLY_BUILDER_API_KEY ||
      !process.env.POLY_BUILDER_SECRET ||
      !process.env.POLY_BUILDER_PASSPHRASE
    ) {
      console.log('Builder credentials not set, cannot use relayer');
      return null;
    }

    const provider = new JsonRpcProvider(getPolygonRpcUrl(), 137);
    const wallet = new Wallet(safeOwnerPrivateKey, provider);
    const relayerUrl = process.env.POLYMARKET_RELAYER_HOST || 'https://relayer-v2.polymarket.com/';

    const builderConfig = new BuilderConfig({
      localBuilderCreds: {
        key: process.env.POLY_BUILDER_API_KEY,
        secret: process.env.POLY_BUILDER_SECRET,
        passphrase: process.env.POLY_BUILDER_PASSPHRASE,
      },
    });

    const relayClient = new RelayClient(relayerUrl, 137, wallet, builderConfig, RelayerTxType.SAFE);

    const erc20Iface = new Interface(['function transfer(address to, uint256 amount)']);
    const amountWei = parseUnits(amount, USDC_DECIMALS);

    const txns = [
      {
        to: USDC_E_ADDRESS,
        data: erc20Iface.encodeFunctionData('transfer', [to, amountWei]),
        value: '0',
      },
    ];

    console.log(`Sending ${amount} USDC.e via relayer from Safe ${safeAddress}...`);

    const response = await relayClient.execute(txns);
    console.log(`Relayer execute response: txID=${response.transactionID}`);

    const tx = await relayClient.pollUntilState(
      response.transactionID,
      ['STATE_MINED', 'STATE_CONFIRMED'],
      'STATE_FAILED',
      60,
      2000
    );

    if (!tx) {
      // Query final state for debugging
      try {
        const txns = await relayClient.getTransaction(response.transactionID);
        const state = txns?.[0]?.state ?? 'NOT_FOUND';
        const hash = txns?.[0]?.transactionHash ?? 'none';
        console.log(`Relayer tx failed (txID=${response.transactionID}, state=${state}, hash=${hash})`);
      } catch {
        console.log(`Relayer tx failed (txID=${response.transactionID}, could not query state)`);
      }
      return null;
    }

    console.log(`Returned via relayer (tx: ${tx.transactionHash})`);
    return tx.transactionHash;
  } catch (err) {
    console.error('Relayer fallback failed:', err);
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
