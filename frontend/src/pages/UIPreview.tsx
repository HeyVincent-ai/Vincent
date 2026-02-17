import { useState } from 'react';
import AccountTypeGroup from '../components/AccountTypeGroup';
import CreateAccountModal from '../components/CreateAccountModal';
import ApiKeyRevealModal from '../components/ApiKeyRevealModal';
import QrModal from '../components/QrModal';
import CopyButton from '../components/CopyButton';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_ORDER,
  getAccountTypeConfig,
} from '../components/accountTypes';
import {
  MockPolymarketPositions,
  type PolymarketPosition,
} from '../components/PolymarketPositions';
import type { Account } from '../components/AccountCard';

// ── Mock Data ───────────────────────────────────────────────────────

type CustodyState = 'not-ready' | 'claimable' | 'claimed';

interface MockAccount extends Account {
  custodyState?: CustodyState;
  ownerAddress?: string;
  custodyChains?: string[];
}

const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: '1',
    type: 'EVM_WALLET',
    memo: 'Trading Bot (New)',
    walletAddress: '0x1F74b3C2a8c5D9E6F7A8B9C0D1E2F3A4B5C6D7E8',
    createdAt: '2025-01-15T10:00:00Z',
    totalBalance: 0,
    custodyState: 'not-ready',
  },
  {
    id: '2',
    type: 'EVM_WALLET',
    memo: 'DeFi Yield Farmer',
    walletAddress: '0xAaBbCcDdEeFf00112233445566778899AaBbCcDd',
    createdAt: '2025-02-01T14:30:00Z',
    totalBalance: 14520.0,
    custodyState: 'claimable',
    custodyChains: ['Base', 'Base Sepolia'],
  },
  {
    id: '7',
    type: 'EVM_WALLET',
    memo: 'Production Wallet',
    walletAddress: '0xFa3b2C1d0E9F8A7B6C5D4E3F2A1B0C9D8E7F6A5B',
    createdAt: '2024-12-01T08:00:00Z',
    totalBalance: 2847.32,
    custodyState: 'claimed',
    ownerAddress: '0xAbCd…7890',
    custodyChains: ['Base', 'Base Sepolia'],
  },
  {
    id: '3',
    type: 'POLYMARKET_WALLET',
    memo: 'Election Predictions',
    walletAddress: '0x9876543210AbCdEf9876543210AbCdEf98765432',
    eoaAddress: '0xFeDcBa0987654321FeDcBa0987654321FeDcBa09',
    createdAt: '2025-01-20T09:00:00Z',
    totalBalance: 4826.5,
  },
  {
    id: '4',
    type: 'RAW_SIGNER',
    memo: 'Cross-chain Agent',
    ethAddress: '0xDeAdBeEf00000000000000000000000000000001',
    solanaAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    createdAt: '2025-01-25T16:00:00Z',
    totalBalance: 312.08,
  },
  {
    id: '5',
    type: 'DATA_SOURCES',
    memo: 'Market Data Feed',
    createdAt: '2025-02-10T11:00:00Z',
    totalBalance: 8.45,
  },
  {
    id: '6',
    type: 'RAW_SIGNER',
    memo: null,
    ethAddress: '0xCaFeBaBe00000000000000000000000000000002',
    solanaAddress: '9zKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsV',
    createdAt: '2025-02-12T08:00:00Z',
    totalBalance: 0,
  },
];

// ── Dashboard Preview ───────────────────────────────────────────────

function DashboardPreview() {
  const [showCreate, setShowCreate] = useState(false);
  const [revealApiKey, setRevealApiKey] = useState<string | null>(null);
  const [receiveAccount, setReceiveAccount] = useState<Account | null>(null);

  const activeGroups = ACCOUNT_TYPE_ORDER.map((type) => ({
    type,
    config: ACCOUNT_TYPES[type],
    accounts: MOCK_ACCOUNTS.filter((a) => a.type === type),
  })).filter((g) => g.accounts.length > 0);

  // Calculate overview metrics
  const totalAssets = MOCK_ACCOUNTS
    .filter(
      (a) =>
        a.type === 'EVM_WALLET' ||
        a.type === 'POLYMARKET_WALLET' ||
        a.type === 'RAW_SIGNER'
    )
    .reduce((sum, a) => sum + (a.totalBalance || 0), 0);
  const totalAccounts = MOCK_ACCOUNTS.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          + New Account
        </button>
      </div>

      {/* Overview Section */}
      <div className="bg-card rounded-lg border border-border px-4 py-3 mb-6">
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Total Assets
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-semibold text-foreground font-mono">
                ${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-xs text-green-400">+2.3%</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Total Accounts
            </p>
            <p className="text-sm text-foreground font-mono">{totalAccounts}</p>
          </div>
        </div>
      </div>

      <div>
        {activeGroups.map((group) => (
          <AccountTypeGroup
            key={group.type}
            label={group.config.pluralLabel}
            icon={group.config.icon}
            accounts={group.accounts}
            onReceive={setReceiveAccount}
          />
        ))}
      </div>

      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          onCreated={(key) => {
            setShowCreate(false);
            setRevealApiKey(key);
          }}
        />
      )}

      {revealApiKey && (
        <ApiKeyRevealModal apiKey={revealApiKey} onDone={() => setRevealApiKey(null)} />
      )}

      {receiveAccount && (
        <QrModal
          address={receiveAccount.walletAddress || receiveAccount.ethAddress || ''}
          label={receiveAccount.memo || 'Unnamed account'}
          onClose={() => setReceiveAccount(null)}
        />
      )}
    </div>
  );
}

// ── Detail Preview ──────────────────────────────────────────────────

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type TabId = 'overview' | 'policies' | 'apikeys' | 'auditlogs';

function DetailPreview({ account }: { account: MockAccount }) {
  const typeConfig = getAccountTypeConfig(account.type);
  const Icon = typeConfig.icon;
  const accountName = account.memo || 'Unnamed Account';

  const addresses: { label: string; address: string }[] = [];
  if (account.type === 'POLYMARKET_WALLET') {
    if (account.walletAddress)
      addresses.push({ label: 'Safe (Polygon)', address: account.walletAddress });
    if (account.eoaAddress) addresses.push({ label: 'EOA', address: account.eoaAddress });
  } else {
    if (account.walletAddress)
      addresses.push({ label: 'Smart Account', address: account.walletAddress });
  }
  if (account.ethAddress) addresses.push({ label: 'Ethereum', address: account.ethAddress });
  if (account.solanaAddress) addresses.push({ label: 'Solana', address: account.solanaAddress });

  const tabsForType = (() => {
    switch (account.type) {
      case 'EVM_WALLET':
      case 'POLYMARKET_WALLET':
        return [
          { id: 'overview' as TabId, label: 'Overview' },
          { id: 'policies' as TabId, label: 'Policies' },
          { id: 'apikeys' as TabId, label: 'API Keys' },
          { id: 'auditlogs' as TabId, label: 'Audit Logs' },
        ];
      case 'DATA_SOURCES':
        return [
          { id: 'overview' as TabId, label: 'Overview' },
          { id: 'apikeys' as TabId, label: 'API Keys' },
          { id: 'auditlogs' as TabId, label: 'Audit Logs' },
        ];
      default:
        return [
          { id: 'policies' as TabId, label: 'Policies' },
          { id: 'apikeys' as TabId, label: 'API Keys' },
          { id: 'auditlogs' as TabId, label: 'Audit Logs' },
        ];
    }
  })();

  const [tab, setTab] = useState<TabId>(tabsForType[0].id);
  const [showReceiveQr, setShowReceiveQr] = useState(false);
  const [qrAddress, setQrAddress] = useState<string>('');

  return (
    <div>
      <nav className="flex items-center gap-1.5 text-sm mb-4">
        <span className="text-muted-foreground">Accounts</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium truncate max-w-[200px]">{accountName}</span>
      </nav>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Sidebar */}
        <div className="md:w-64 shrink-0 space-y-6">
          {/* Identity */}
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{typeConfig.label}</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground">{accountName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {new Date(account.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Addresses */}
          {addresses.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Addresses
              </h3>
              <div className="space-y-1.5">
                {addresses.map((a) => (
                  <div key={a.address} className="flex items-center justify-between gap-2 py-1">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{a.label}</div>
                      <code className="text-xs text-foreground/70 font-mono" title={a.address}>
                        {truncateAddress(a.address)}
                      </code>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setShowReceiveQr(true);
                          setQrAddress(a.address);
                        }}
                        className="text-muted-foreground/60 hover:text-primary transition-colors p-1"
                        title="Show QR code"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      </button>
                      <CopyButton text={a.address} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Self-Custody — EVM wallets only */}
          {account.type === 'EVM_WALLET' && account.custodyState && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Self-Custody
              </h3>
              {account.custodyState === 'not-ready' && (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Make at least one on-chain transaction to enable self-custody.
                  </p>
                </>
              )}
              {account.custodyState === 'claimable' && (
                <>
                  <button className="text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-3 py-1.5 rounded-md border border-primary/20">
                    Claim self-custody
                  </button>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    Transfer on-chain ownership to your personal wallet. Vincent still operates on your behalf, subject to your policies.
                  </p>
                </>
              )}
              {account.custodyState === 'claimed' && (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-xs text-green-400">Claimed</span>
                  </div>
                  {account.ownerAddress && (
                    <code className="text-xs text-foreground/70 font-mono mt-1 block">
                      {account.ownerAddress}
                    </code>
                  )}
                  {account.custodyChains && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {account.custodyChains.join(', ')}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Agent Access */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Agent Access
            </h3>
            <button className="text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-3 py-1.5 rounded-md border border-primary/20">
              Generate re-link token
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              One-time token for agent access. Expires in 10 min.
            </p>
          </div>

          {/* Danger zone */}
          <div className="pt-4 border-t border-border/50">
            <button className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors py-1">
              Delete account
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Tab Bar */}
          <div className="border-b border-border mb-6">
            <div className="flex gap-1">
              {tabsForType.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 pb-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {tab === 'overview' && account.type === 'EVM_WALLET' && <MockEvmOverview />}
          {tab === 'overview' && account.type === 'POLYMARKET_WALLET' && <MockPolymarketOverview />}
          {tab === 'overview' && account.type === 'DATA_SOURCES' && <MockDataSourcesOverview />}
          {tab === 'policies' && <MockPolicies />}
          {tab === 'apikeys' && <MockApiKeys />}
          {tab === 'auditlogs' && <MockAuditLogs />}
        </div>
      </div>

      {showReceiveQr && qrAddress && (
        <QrModal
          address={qrAddress}
          label={accountName}
          onClose={() => setShowReceiveQr(false)}
        />
      )}
    </div>
  );
}

// ── Mock Tab Content ────────────────────────────────────────────────

function MockEvmOverview() {
  return (
    <div className="space-y-6">
      {/* Balances */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Balance</p>
            <p className="text-xl font-semibold text-foreground font-mono">$2,847.32</p>
          </div>
          <button className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
            Refresh
          </button>
        </div>

        {/* Base */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Base</p>
          <div className="space-y-0 divide-y divide-border/50">
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png"
                  alt="ETH"
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="hidden w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center">
                  <span className="text-blue-400 text-[11px] font-bold">E</span>
                </div>
                <span className="text-sm text-foreground">ETH</span>
              </div>
              <div className="text-right">
                <span className="text-sm text-foreground font-mono">0.5421</span>
                <span className="text-xs text-muted-foreground ml-2">$1,625.50</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
                  alt="USDC"
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="hidden w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center">
                  <span className="text-green-400 text-[11px] font-bold">U</span>
                </div>
                <span className="text-sm text-foreground">USDC</span>
              </div>
              <div className="text-right">
                <span className="text-sm text-foreground font-mono">295.00</span>
                <span className="text-xs text-muted-foreground ml-2">$295.00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Base Sepolia */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Base Sepolia</p>
            <span className="text-[11px] px-2 py-0.5 text-yellow-400 bg-yellow-500/10 rounded">
              testnet
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              <img
                src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png"
                alt="ETH"
                className="w-6 h-6 rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center">
                <span className="text-blue-400 text-[11px] font-bold">E</span>
              </div>
              <span className="text-sm text-foreground">ETH</span>
            </div>
            <span className="text-sm text-foreground font-mono">1.2500</span>
          </div>
        </div>
      </div>

      {/* Mainnet Access */}
      <div className="py-4 border-t border-border/50">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-sm text-foreground font-medium">Mainnet Access</p>
            <p className="text-xs text-green-400 mt-0.5">Trial active — 5 days remaining</p>
          </div>
          <button className="text-xs text-primary hover:text-primary/80 transition-colors">
            View plans
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Testnets always free. Mainnet $10/mo after trial.
        </p>
      </div>

    </div>
  );
}

const MOCK_POLYMARKET_POSITIONS: PolymarketPosition[] = [
  {
    conditionId: '0xabc123',
    title: 'Will Bitcoin exceed $150,000 by June 30, 2025?',
    outcome: 'Yes',
    outcomeIndex: 0,
    size: 1250,
    avgPrice: 0.42,
    curPrice: 0.58,
    initialValue: 525,
    currentValue: 725,
    cashPnl: 200,
    percentPnl: 38.1,
    realizedPnl: 0,
    redeemable: false,
    slug: 'bitcoin-150k-june-2025',
    eventSlug: 'bitcoin-150k-june-2025',
    icon: '',
    endDate: '2025-06-30T23:59:59Z',
  },
  {
    conditionId: '0xdef456',
    title: 'Will the Fed cut rates in March 2025?',
    outcome: 'No',
    outcomeIndex: 1,
    size: 800,
    avgPrice: 0.65,
    curPrice: 0.78,
    initialValue: 520,
    currentValue: 624,
    cashPnl: 104,
    percentPnl: 20.0,
    realizedPnl: 0,
    redeemable: false,
    slug: 'fed-rate-cut-march-2025',
    eventSlug: 'fed-rate-cut-march-2025',
    icon: '',
    endDate: '2025-03-20T18:00:00Z',
  },
  {
    conditionId: '0x789ghi',
    title: 'Super Bowl LIX: Will the Kansas City Chiefs win?',
    outcome: 'Yes',
    outcomeIndex: 0,
    size: 500,
    avgPrice: 0.55,
    curPrice: 0.48,
    initialValue: 275,
    currentValue: 240,
    cashPnl: -35,
    percentPnl: -12.7,
    realizedPnl: 0,
    redeemable: false,
    slug: 'super-bowl-lix-chiefs',
    eventSlug: 'super-bowl-lix-chiefs',
    icon: '',
    endDate: '2025-02-09T23:59:59Z',
  },
  {
    conditionId: '0xjkl012',
    title: 'Will Ethereum ETF see $1B net inflows in January 2025?',
    outcome: 'Yes',
    outcomeIndex: 0,
    size: 2000,
    avgPrice: 0.3,
    curPrice: 0.91,
    initialValue: 600,
    currentValue: 1820,
    cashPnl: 1220,
    percentPnl: 203.3,
    realizedPnl: 1820,
    redeemable: true,
    slug: 'eth-etf-inflows-jan-2025',
    eventSlug: 'eth-etf-inflows-jan-2025',
    icon: '',
    endDate: '2025-01-31T23:59:59Z',
  },
  {
    conditionId: '0xmno345',
    title: 'Will GPT-5 be released before April 2025?',
    outcome: 'Yes',
    outcomeIndex: 0,
    size: 350,
    avgPrice: 0.38,
    curPrice: 0.22,
    initialValue: 133,
    currentValue: 77,
    cashPnl: -56,
    percentPnl: -42.1,
    realizedPnl: 0,
    redeemable: false,
    slug: 'gpt5-release-april-2025',
    eventSlug: 'gpt5-release-april-2025',
    icon: '',
    endDate: '2025-04-01T00:00:00Z',
  },
];

function MockPolymarketOverview() {
  return (
    <MockPolymarketPositions
      positions={MOCK_POLYMARKET_POSITIONS}
      usdcBalance={1340.5}
      totalPositionValue={3486}
    />
  );
}

function MockDataSourcesOverview() {
  const mockDataSources = [
    {
      id: 'twitter',
      displayName: 'Twitter / X.com',
      description: 'Search tweets, get user profiles, and retrieve recent tweets via the X API v2.',
      status: 'active' as const,
      endpoints: [
        { name: 'Search recent tweets', cost: 0.01 },
        { name: 'Get tweet by ID', cost: 0.005 },
        { name: 'Get user profile by username', cost: 0.005 },
        { name: "Get a user's recent tweets", cost: 0.01 },
      ],
      currentMonth: { requests: 89, cost: 2.23 },
    },
    {
      id: 'brave',
      displayName: 'Brave Search',
      description: 'Web and news search powered by Brave Search.',
      status: 'active' as const,
      endpoints: [
        { name: 'Web search', cost: 0.005 },
        { name: 'News search', cost: 0.005 },
      ],
      currentMonth: { requests: 53, cost: 1.32 },
    },
  ];

  const totalMonthRequests = mockDataSources.reduce((s, d) => s + d.currentMonth.requests, 0);
  const totalMonthSpend = mockDataSources.reduce((s, d) => s + d.currentMonth.cost, 0);

  return (
    <div className="space-y-6">
      {/* Credits */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Credits</p>
          <button className="text-xs text-primary hover:text-primary/80 transition-colors">
            Add credits
          </button>
        </div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-xl font-semibold text-foreground font-mono">$8.45</span>
          <span className="text-xs text-muted-foreground">remaining</span>
        </div>
        <div className="w-full bg-muted/30 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-green-500/60 transition-all"
            style={{ width: '72%' }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {totalMonthRequests} requests this month (${totalMonthSpend.toFixed(2)})
        </p>
      </div>

      {/* Available Data Sources */}
      <div className="border-t border-border/50 pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
          Available Data Sources
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockDataSources.map((ds) => (
            <div key={ds.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">{ds.displayName}</p>
                <span className="text-[11px] px-2 py-0.5 text-green-400 bg-green-500/10 rounded">
                  Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{ds.description}</p>

              {/* Per-endpoint pricing */}
              <div className="space-y-1 mb-3">
                {ds.endpoints.map((ep) => (
                  <div key={ep.name} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{ep.name}</span>
                    <span className="text-foreground font-mono">${ep.cost.toFixed(3)}</span>
                  </div>
                ))}
              </div>

              {/* Current month usage */}
              {ds.currentMonth.requests > 0 && (
                <div className="border-t border-border/50 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {ds.currentMonth.requests} requests this month
                    </span>
                    <span className="text-foreground font-mono">
                      ${ds.currentMonth.cost.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Usage History */}
      <div className="border-t border-border/50 pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Usage History</p>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Month</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Requests</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {[
                { month: '2026-02', requests: 142, cost: 3.55 },
                { month: '2026-01', requests: 310, cost: 7.75 },
                { month: '2025-12', requests: 198, cost: 4.95 },
              ].map((row) => (
                <tr key={row.month}>
                  <td className="px-4 py-2.5 text-foreground">{row.month}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{row.requests}</td>
                  <td className="px-4 py-2.5 text-right text-foreground font-mono tabular-nums font-semibold">
                    ${row.cost.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Purchases */}
      <div className="border-t border-border/50 pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
          Credit Purchases
        </p>
        <div className="divide-y divide-border/50">
          {[
            { date: '2026-01-15', amount: 25.0 },
            { date: '2025-12-01', amount: 10.0 },
          ].map((p) => (
            <div key={p.date} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-foreground">
                {new Date(p.date).toLocaleDateString()}
              </span>
              <span className="text-sm text-green-400 font-mono tabular-nums">
                +${p.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockPolicies() {
  const policies = [
    { id: '1', label: 'Daily Spending Limit', config: '$500', hasOverride: false },
    { id: '2', label: 'Address Allowlist', config: '0x1234…5678, 0xAbCd…eF01', hasOverride: true },
    { id: '3', label: 'Spending Limit Per Tx', config: '$100', hasOverride: false },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Policies</p>
        <button className="text-xs text-primary hover:text-primary/80 transition-colors">
          Add policy
        </button>
      </div>
      <div className="space-y-0 divide-y divide-border/50">
        {policies.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{p.label}</span>
                {p.hasOverride && (
                  <span className="text-[11px] px-2 py-0.5 text-yellow-400 bg-yellow-500/10 rounded">
                    approval override
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">{p.config}</p>
            </div>
            <button className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors ml-4 shrink-0">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockApiKeys() {
  const keys = [
    { id: '1', name: 'Trading Agent', createdAt: '2025-01-15', revokedAt: null },
    { id: '2', name: 'Monitoring Bot', createdAt: '2025-01-20', revokedAt: null },
    { id: '3', name: 'Old Key', createdAt: '2025-01-01', revokedAt: '2025-01-10' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">API Keys</p>
        <button className="text-xs text-primary hover:text-primary/80 transition-colors">
          Create key
        </button>
      </div>
      <div className="space-y-0 divide-y divide-border/50">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground">{k.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {new Date(k.createdAt).toLocaleDateString()}
              </span>
              {k.revokedAt && (
                <span className="text-[11px] px-2 py-0.5 text-destructive/80 bg-destructive/10 rounded">
                  revoked
                </span>
              )}
            </div>
            {!k.revokedAt && (
              <button className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockAuditLogs() {
  const logs = [
    { id: '1', action: 'SIGN_TRANSACTION', status: 'SUCCESS', time: '2 min ago', error: null },
    {
      id: '2',
      action: 'SIGN_TRANSACTION',
      status: 'FAILED',
      time: '15 min ago',
      error: 'Daily spending limit exceeded',
    },
    { id: '3', action: 'SIGN_MESSAGE', status: 'SUCCESS', time: '1 hour ago', error: null },
    { id: '4', action: 'SIGN_TRANSACTION', status: 'PENDING', time: '2 hours ago', error: null },
    { id: '5', action: 'GET_BALANCES', status: 'SUCCESS', time: '3 hours ago', error: null },
  ];

  const dot = (s: string) => {
    if (s === 'SUCCESS') return 'bg-green-400';
    if (s === 'FAILED') return 'bg-red-400';
    return 'bg-yellow-400';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Audit Logs</p>
        <div className="flex gap-2">
          <select className="bg-transparent border border-border/50 rounded px-2 py-1.5 text-xs text-muted-foreground">
            <option>All actions</option>
            <option>SIGN_TRANSACTION</option>
            <option>SIGN_MESSAGE</option>
          </select>
          <select className="bg-transparent border border-border/50 rounded px-2 py-1.5 text-xs text-muted-foreground">
            <option>All statuses</option>
            <option>SUCCESS</option>
            <option>FAILED</option>
          </select>
        </div>
      </div>
      <div className="space-y-0 divide-y divide-border/50">
        {logs.map((log) => (
          <div key={log.id} className="py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-1.5 h-1.5 rounded-full ${dot(log.status)}`} />
                <span className="text-sm text-foreground font-mono">{log.action}</span>
              </div>
              <span className="text-xs text-muted-foreground">{log.time}</span>
            </div>
            {log.error && <p className="text-xs text-red-400/70 ml-4 mt-0.5">{log.error}</p>}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <span className="text-xs text-muted-foreground">5 of 47</span>
        <div className="flex gap-1">
          <button className="px-2 py-0.5 rounded text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
            Prev
          </button>
          <button className="px-2 py-0.5 rounded text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Preview Page ───────────────────────────────────────────────

export default function UIPreview() {
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
  const [selectedAccount, setSelectedAccount] = useState<MockAccount>(MOCK_ACCOUNTS[0]);

  return (
    <div className="min-h-screen bg-background">
      {/* Preview nav */}
      <div className="border-b border-border/50 px-6 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-2">
            Preview
          </span>
          <button
            onClick={() => setView('dashboard')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${view === 'dashboard' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Dashboard
          </button>
          {MOCK_ACCOUNTS.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setView('detail');
                setSelectedAccount(a);
              }}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${view === 'detail' && selectedAccount.id === a.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {a.memo || 'Unnamed'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-6">
        {view === 'dashboard' ? (
          <DashboardPreview />
        ) : (
          <DetailPreview key={selectedAccount.id} account={selectedAccount} />
        )}
      </div>
    </div>
  );
}
