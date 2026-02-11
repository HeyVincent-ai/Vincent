# /fund Endpoint Implementation Plan

## Overview
Create `/fund/preview`, `/fund/execute`, `/fund/status/:requestId` endpoints for depositing assets from EVM Zerodev smart account to deposit address. Support same-chain transfers and cross-chain swaps via Relay.link.

## Critical Files

**New:**
- `src/skills/relay.service.ts` - Relay.link API integration

**Modify:**
- `src/skills/evmWallet.service.ts` - Fund logic (preview/execute)
- `src/api/routes/evmWallet.routes.ts` - Route handlers
- `src/e2e/evmWallet.e2e.test.ts` - crossChainFund test

---

## Phase 1: Write Test First (TDD)

### 1.1 Add crossChainFund test to evmWallet.e2e.test.ts

Location: After line 653

```typescript
it('should fund USDC from Base to Polygon deposit address', async () => {
  const POLYGON_CHAIN_ID = 137;
  const USDC_E_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  const FUND_AMOUNT = '0.001';

  // Preview
  const previewRes = await request(app)
    .post('/api/skills/evm-wallet/fund/preview')
    .set('Authorization', `Bearer ${apiKey}`)
    .send({
      tokenIn: USDC_ADDRESS,
      sourceChainId: BASE_MAINNET_CHAIN_ID,
      depositChainId: POLYGON_CHAIN_ID,
      depositWalletAddress: funderAddress,
      tokenInAmount: FUND_AMOUNT,
      tokenOut: USDC_E_POLYGON,
      slippage: 100,
    })
    .expect(200);

  expect(previewRes.body.success).toBe(true);
  expect(previewRes.body.data.isSimpleTransfer).toBe(false);
  expect(previewRes.body.data.balanceCheck.sufficient).toBe(true);
  expect(previewRes.body.data.amountOut).toBeDefined();
  expect(previewRes.body.data.timeEstimate).toBeGreaterThan(0);

  // Execute
  const executeRes = await request(app)
    .post('/api/skills/evm-wallet/fund/execute')
    .set('Authorization', `Bearer ${apiKey}`)
    .send({
      tokenIn: USDC_ADDRESS,
      sourceChainId: BASE_MAINNET_CHAIN_ID,
      depositChainId: POLYGON_CHAIN_ID,
      depositWalletAddress: funderAddress,
      tokenInAmount: FUND_AMOUNT,
      tokenOut: USDC_E_POLYGON,
      slippage: 100,
    })
    .expect(200);

  expect(executeRes.body.success).toBe(true);
  expect(executeRes.body.data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  expect(executeRes.body.data.status).toMatch(/executed|cross_chain_pending/);
  expect(executeRes.body.data.relayRequestId).toBeDefined();

  evidence.fundTxHash = executeRes.body.data.txHash;
  evidence.relayRequestId = executeRes.body.data.relayRequestId;

  // Status check
  if (executeRes.body.data.relayRequestId) {
    const statusRes = await request(app)
      .get(`/api/skills/evm-wallet/fund/status/${executeRes.body.data.relayRequestId}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    expect(statusRes.body.success).toBe(true);
    expect(statusRes.body.data.status).toBeDefined();
  }
}, 240_000);
```

---

## Phase 2: Service Foundation

### 2.1 Create relay.service.ts

Pattern: Similar to `zeroEx.service.ts`

**API config:**
```typescript
const RELAY_API_BASE_URL = 'https://api.relay.link';

// No API key required
// No fee subsidization - users pay full fees
// No min amount thresholds
```

**Types:**
```typescript
interface RelayQuoteParams {
  user: string;              // Smart account
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;    // Token (0x0...0 for native)
  destinationCurrency: string;
  amount: string;            // Wei
  tradeType: 'EXACT_INPUT';
  recipient?: string;        // Deposit address
  slippageTolerance?: string;
}

interface RelayQuoteResponse {
  steps: RelayStep[];
  fees: RelayFees;
  details: {
    currencyOut: { amount: string; amountFormatted: string };
    timeEstimate: number;
    operation: string;
  };
}

interface RelayStep {
  id: string;
  action: string;
  kind: 'transaction' | 'signature';
  requestId: string;
  items: Array<{
    status: string;
    data: {
      from: string;
      to: string;
      data: string;
      value: string;
      chainId: number;
    };
  }>;
}

interface RelayStatusResponse {
  status: 'pending' | 'complete' | 'failed';
  steps: RelayStep[];
}
```

**Functions:**
```typescript
export async function getQuote(params: RelayQuoteParams): Promise<RelayQuoteResponse> {
  const url = `${RELAY_API_BASE_URL}/quote`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Relay API error:', error);
    throw new AppError('RELAY_API_ERROR', error.message || 'Failed to get quote', 502);
  }

  return response.json();
}

export async function getStatus(requestId: string): Promise<RelayStatusResponse> {
  const url = `${RELAY_API_BASE_URL}/requests/${requestId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new AppError('RELAY_API_ERROR', 'Failed to get status', 502);
  }

  return response.json();
}

function isNativeToken(token: string): boolean {
  return token === 'ETH' || token === '0x0000000000000000000000000000000000000000';
}

function normalizeTokenAddress(token: string): string {
  return isNativeToken(token) ? '0x0000000000000000000000000000000000000000' : token;
}
```

### 2.2 Add types to evmWallet.service.ts

Location: After swap types (around line 523)

```typescript
// ============================================================
// Fund Types
// ============================================================

export interface FundPreviewInput {
  secretId: string;
  tokenIn: string;
  sourceChainId: number;
  depositChainId: number;
  depositWalletAddress: string;
  tokenInAmount: string;
  tokenOut: string;
  slippage?: number;
}

export interface FundPreviewOutput {
  isSimpleTransfer: boolean;
  tokenIn: string;
  tokenOut: string;
  sourceChainId: number;
  depositChainId: number;
  depositWalletAddress: string;
  amountIn: string;
  amountOut: string;
  route?: string;
  timeEstimate?: number;
  fees: {
    gas: string;
    relayer?: string;
    total: string;
  };
  smartAccountAddress: string;
  balanceCheck: {
    sufficient: boolean;
    currentBalance: string;
    requiredBalance: string;
    tokenSymbol: string;
  };
}

export interface FundExecuteInput {
  secretId: string;
  apiKeyId?: string;
  tokenIn: string;
  sourceChainId: number;
  depositChainId: number;
  depositWalletAddress: string;
  tokenInAmount: string;
  tokenOut: string;
  slippage?: number;
}

export interface FundExecuteOutput {
  txHash: string | null;
  status: 'executed' | 'pending_approval' | 'denied' | 'cross_chain_pending';
  isSimpleTransfer: boolean;
  relayRequestId?: string;
  smartAccountAddress: string;
  reason?: string;
  transactionLogId: string;
  explorerUrl?: string;
}
```

### 2.3 Add helper functions to evmWallet.service.ts

```typescript
async function getTokenBalance(
  address: Address,
  token: string,
  chainId: number
): Promise<string> {
  if (isNativeToken(token)) {
    const client = createPublicClient({
      chain: getChainFromId(chainId),
      transport: http(getRpcUrl(chainId))
    });
    const balance = await client.getBalance({ address });
    return formatEther(balance);
  } else {
    const portfolio = await alchemy.getPortfolioBalances(address, [chainId]);
    const tokenData = portfolio.tokens.find(
      t => t.tokenAddress?.toLowerCase() === token.toLowerCase()
    );
    return tokenData
      ? formatUnits(BigInt(tokenData.tokenBalance), tokenData.decimals)
      : '0';
  }
}

function buildCallsFromRelaySteps(steps: RelayStep[]): Array<{to: Address; data: Hex; value: bigint}> {
  const calls = [];
  for (const step of steps) {
    if (step.kind === 'transaction') {
      for (const item of step.items) {
        calls.push({
          to: item.data.to as Address,
          data: item.data.data as Hex,
          value: BigInt(item.data.value),
        });
      }
    }
  }
  return calls;
}
```

---

## Phase 3: Core Logic

### 3.1 Implement previewFund()

Add to evmWallet.service.ts:

```typescript
export async function previewFund(input: FundPreviewInput): Promise<FundPreviewOutput> {
  const wallet = await getWalletData(input.secretId);

  // 1. Balance check
  const tokenSymbol = await getTokenSymbolHelper(input.tokenIn, input.sourceChainId);
  const currentBalance = await getTokenBalance(
    wallet.smartAccountAddress,
    input.tokenIn,
    input.sourceChainId
  );
  const requiredBalance = input.tokenInAmount;
  const sufficient = parseFloat(currentBalance) >= parseFloat(requiredBalance);

  // 2. Check if simple transfer
  const isSimple =
    input.tokenIn.toLowerCase() === input.tokenOut.toLowerCase() &&
    input.sourceChainId === input.depositChainId;

  if (isSimple) {
    // Estimate gas for direct transfer
    const estimatedGas = '0.001'; // Approximate ETH for gas
    return {
      isSimpleTransfer: true,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      sourceChainId: input.sourceChainId,
      depositChainId: input.depositChainId,
      depositWalletAddress: input.depositWalletAddress,
      amountIn: input.tokenInAmount,
      amountOut: input.tokenInAmount,
      fees: { gas: estimatedGas, total: estimatedGas },
      smartAccountAddress: wallet.smartAccountAddress,
      balanceCheck: { sufficient, currentBalance, requiredBalance, tokenSymbol }
    };
  }

  // 3. Cross-chain: Get Relay quote
  const amountWei = await tokenAmountToWei(
    input.tokenIn,
    input.tokenInAmount,
    input.sourceChainId
  );

  const quote = await relay.getQuote({
    user: wallet.smartAccountAddress,
    originChainId: input.sourceChainId,
    destinationChainId: input.depositChainId,
    originCurrency: relay.normalizeTokenAddress(input.tokenIn),
    destinationCurrency: relay.normalizeTokenAddress(input.tokenOut),
    amount: amountWei,
    tradeType: 'EXACT_INPUT',
    recipient: input.depositWalletAddress,
    slippageTolerance: input.slippage?.toString(),
  });

  return {
    isSimpleTransfer: false,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    sourceChainId: input.sourceChainId,
    depositChainId: input.depositChainId,
    depositWalletAddress: input.depositWalletAddress,
    amountIn: amountWei,
    amountOut: quote.details.currencyOut.amount,
    route: quote.details.operation,
    timeEstimate: quote.details.timeEstimate,
    fees: extractFeesFromRelay(quote.fees),
    smartAccountAddress: wallet.smartAccountAddress,
    balanceCheck: { sufficient, currentBalance, requiredBalance, tokenSymbol }
  };
}
```

### 3.2 Implement executeFund()

Add to evmWallet.service.ts:

```typescript
export async function executeFund(input: FundExecuteInput): Promise<FundExecuteOutput> {
  const wallet = await getWalletData(input.secretId);

  // 1. Subscription check
  const subCheck = await gasService.checkSubscriptionForChain(
    wallet.userId,
    input.sourceChainId
  );

  // 2. Preview + balance validation
  const preview = await previewFund({
    secretId: input.secretId,
    tokenIn: input.tokenIn,
    sourceChainId: input.sourceChainId,
    depositChainId: input.depositChainId,
    depositWalletAddress: input.depositWalletAddress,
    tokenInAmount: input.tokenInAmount,
    tokenOut: input.tokenOut,
    slippage: input.slippage,
  });

  if (!preview.balanceCheck.sufficient) {
    throw new AppError(
      'INSUFFICIENT_BALANCE',
      `Insufficient balance. Have ${preview.balanceCheck.currentBalance} ${preview.balanceCheck.tokenSymbol}, need ${preview.balanceCheck.requiredBalance}`,
      400
    );
  }

  // 3. Policy check
  const policyAction: PolicyCheckAction = {
    type: preview.isSimpleTransfer ? 'transfer' : 'send_transaction',
    to: input.depositWalletAddress.toLowerCase(),
    chainId: input.sourceChainId,
    // ... token details
  };
  const policyResult = await checkPolicies(input.secretId, policyAction);

  // 4. Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId: input.secretId,
      apiKeyId: input.apiKeyId,
      actionType: 'fund',
      requestData: input,
      status: 'PENDING',
    }
  });

  // 5. Handle policy verdict
  if (policyResult.verdict === 'deny') {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: { status: 'DENIED' }
    });
    return {
      txHash: null,
      status: 'denied',
      isSimpleTransfer: preview.isSimpleTransfer,
      smartAccountAddress: wallet.smartAccountAddress,
      reason: policyResult.reasons.join(', '),
      transactionLogId: txLog.id,
    };
  }

  if (policyResult.verdict === 'require_approval') {
    // Create pending approval (similar to swap)
    return {
      txHash: null,
      status: 'pending_approval',
      isSimpleTransfer: preview.isSimpleTransfer,
      smartAccountAddress: wallet.smartAccountAddress,
      transactionLogId: txLog.id,
    };
  }

  // 6. Execute
  if (preview.isSimpleTransfer) {
    // Use executeTransfer directly
    const result = await executeTransfer({
      secretId: input.secretId,
      to: input.depositWalletAddress,
      amount: input.tokenInAmount,
      token: input.tokenIn,
      chainId: input.sourceChainId,
    });

    // Update txLog with result
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: result.status === 'executed' ? 'EXECUTED' : 'FAILED',
        txHash: result.txHash || undefined,
      }
    });

    return { ...result, isSimpleTransfer: true };
  } else {
    // Cross-chain via Relay
    const quote = await relay.getQuote({
      user: wallet.smartAccountAddress,
      originChainId: input.sourceChainId,
      destinationChainId: input.depositChainId,
      originCurrency: relay.normalizeTokenAddress(input.tokenIn),
      destinationCurrency: relay.normalizeTokenAddress(input.tokenOut),
      amount: preview.amountIn,
      tradeType: 'EXACT_INPUT',
      recipient: input.depositWalletAddress,
      slippageTolerance: input.slippage?.toString(),
    });

    const calls = buildCallsFromRelaySteps(quote.steps);

    const result = calls.length === 1
      ? await zerodev.executeSendTransaction({
          privateKey: wallet.privateKey,
          chainId: input.sourceChainId,
          to: calls[0].to,
          data: calls[0].data,
          value: calls[0].value,
        })
      : await zerodev.executeBatchTransaction({
          privateKey: wallet.privateKey,
          chainId: input.sourceChainId,
          calls,
        });

    // Update log
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: {
        status: 'EXECUTED',
        txHash: result.txHash,
      }
    });

    return {
      txHash: result.txHash,
      status: 'cross_chain_pending',
      isSimpleTransfer: false,
      relayRequestId: quote.steps[0].requestId,
      smartAccountAddress: wallet.smartAccountAddress,
      transactionLogId: txLog.id,
      explorerUrl: buildExplorerUrl(result.txHash, input.sourceChainId),
    };
  }
}
```

---

## Phase 4: API Routes

### 4.1 Add validation schema to evmWallet.routes.ts

Location: After line 255

```typescript
// ============================================================
// Fund Schemas
// ============================================================

const fundSchema = z.object({
  tokenIn: z.string(),
  sourceChainId: z.number().int().positive(),
  depositChainId: z.number().int().positive(),
  depositWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address'),
  tokenInAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be numeric'),
  tokenOut: z.string(),
  slippage: z.number().int().min(0).max(10000).optional(),
});
```

### 4.2 Add POST /fund/preview

```typescript
router.post(
  '/fund/preview',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = fundSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const result = await evmWallet.previewFund({
      secretId: req.secret.id,
      ...body,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.fund_preview',
      inputData: body,
      outputData: result,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, result);
  })
);
```

### 4.3 Add POST /fund/execute

```typescript
router.post(
  '/fund/execute',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = fundSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await evmWallet.executeFund({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      ...body,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.fund_execute',
      inputData: body,
      outputData: result,
      status: ['executed', 'cross_chain_pending'].includes(result.status)
        ? 'SUCCESS'
        : result.status === 'denied'
          ? 'FAILED'
          : 'PENDING',
      errorMessage: result.status === 'denied' ? result.reason : undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    const statusCode = ['executed', 'cross_chain_pending'].includes(result.status)
      ? 200
      : result.status === 'denied'
        ? 403
        : 202;
    sendSuccess(res, result, statusCode);
  })
);
```

### 4.4 Add GET /fund/status/:requestId

```typescript
router.get(
  '/fund/status/:requestId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { requestId } = req.params;

    const status = await relay.getStatus(requestId);

    auditService.log({
      secretId: req.secret?.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.fund_status',
      inputData: { requestId },
      outputData: status,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, status);
  })
);
```

---

## Phase 5: Test & Verify

### 5.1 Run E2E test

```bash
npm run test:e2e -- evmWallet.e2e.test.ts -t "cross-chain fund"
```

**Verify:**
- Preview returns isSimpleTransfer=false
- balanceCheck.sufficient=true
- Execute returns status=cross_chain_pending
- txHash format valid (0x + 64 hex)
- relayRequestId populated
- Status endpoint returns data
- Test uses exactly $0.001 USDC

### 5.2 Manual verification (optional)

```bash
# Preview
curl -X POST http://localhost:3000/api/skills/evm-wallet/fund/preview \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "sourceChainId": 8453,
    "depositChainId": 137,
    "depositWalletAddress": "0x...",
    "tokenInAmount": "0.001",
    "tokenOut": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "slippage": 100
  }'

# Execute
curl -X POST http://localhost:3000/api/skills/evm-wallet/fund/execute \
  [same body]

# Status
curl http://localhost:3000/api/skills/evm-wallet/fund/status/{requestId} \
  -H "Authorization: Bearer $API_KEY"
```

---

## Error Handling

- Balance insufficient: `INSUFFICIENT_BALANCE` (400) with "Have X, need Y"
- Relay API errors: `RELAY_API_ERROR` (502) with API message
- Transaction failures: Update txLog to FAILED, preserve error details
- Re-throw AppErrors to preserve codes/messages
- No error swallowing - all errors propagate to user

---

## Design Decisions

1. ✓ Status polling: GET /fund/status/:requestId
2. ✓ No fee subsidization: Users pay full fees
3. ✓ No min thresholds: Allow any amount
