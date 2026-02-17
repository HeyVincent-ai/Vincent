import { Link } from 'react-router-dom';

export interface Account {
  id: string;
  type: string;
  memo: string | null;
  walletAddress?: string;
  eoaAddress?: string;
  ethAddress?: string;
  solanaAddress?: string;
  createdAt: string;
  /** Total USD value across all tokens / positions. Undefined = not yet loaded. */
  totalBalance?: number;
}

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Primary address to show as a subtle hint on the list card. */
function getPrimaryAddress(account: Account): string | null {
  if (account.walletAddress) return account.walletAddress;
  if (account.ethAddress) return account.ethAddress;
  return null;
}

function formatBalance(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 1)
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return '$0.00';
}

export default function AccountCard({ account }: { account: Account }) {
  const addr = getPrimaryAddress(account);
  const hasBalance = account.totalBalance !== undefined;

  return (
    <Link
      to={`/secrets/${account.id}`}
      className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
    >
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground font-medium group-hover:text-primary transition-colors truncate">
          {account.memo || 'Unnamed account'}
        </span>
        {addr && (
          <span className="text-xs text-muted-foreground font-mono shrink-0 hidden sm:inline">
            {truncateAddress(addr)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {hasBalance && (
          <span className="text-sm text-foreground/80 font-mono tabular-nums">
            {formatBalance(account.totalBalance!)}
          </span>
        )}
        <span className="text-muted-foreground text-xs tabular-nums">
          {new Date(account.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
