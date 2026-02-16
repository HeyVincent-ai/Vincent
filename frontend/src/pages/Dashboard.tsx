import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getUserSecrets, createSecret, claimSecret, getOpenClawDeployments, deployOpenClaw } from '../api';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../components/Toast';
import WelcomeOnboarding from '../components/WelcomeOnboarding';

interface Secret {
  id: string;
  type: string;
  memo: string | null;
  walletAddress?: string;
  ethAddress?: string;
  solanaAddress?: string;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncateAddress(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getAddresses(s: Secret): { label: string; address: string }[] {
  const out: { label: string; address: string }[] = [];
  if (s.walletAddress) out.push({ label: 'Smart Account', address: s.walletAddress });
  if (s.ethAddress) out.push({ label: 'ETH', address: s.ethAddress });
  if (s.solanaAddress) out.push({ label: 'SOL', address: s.solanaAddress });
  return out;
}

// ── Inline Icon Components ──────────────────────────────────────────

function CopyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
      />
    </svg>
  );
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ReceiveIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
    </svg>
  );
}

function WalletIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
      />
    </svg>
  );
}

function DataSourceIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75"
      />
    </svg>
  );
}

// ── Copy Button ─────────────────────────────────────────────────────

function CopyButton({
  text,
  label,
  variant = 'icon',
}: {
  text: string;
  label?: string;
  variant?: 'icon' | 'button';
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  if (variant === 'button') {
    return (
      <button
        onClick={handleCopy}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
          copied
            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
            : 'bg-muted text-muted-foreground border border-border hover:text-foreground hover:border-primary/40'
        }`}
      >
        {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
        {copied ? 'Copied' : label || 'Copy'}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy address"
      className={`p-1 rounded transition-colors duration-150 ${
        copied ? 'text-green-400' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── QR Modal ────────────────────────────────────────────────────────

function QrModal({
  address,
  label,
  onClose,
}: {
  address: string;
  label: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ReceiveIcon className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Receive</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Scan this QR code to send funds to your{' '}
          <span className="text-foreground font-medium">{label}</span> address.
        </p>

        <div className="flex justify-center mb-4">
          <div className="bg-white rounded-xl p-4">
            <QRCodeSVG
              value={address}
              size={200}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
              includeMargin={false}
            />
          </div>
        </div>

        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Wallet address</p>
          <div className="flex items-center gap-2">
            <code className="text-sm text-foreground font-mono break-all flex-1">{address}</code>
            <CopyButton text={address} variant="button" label="Copy" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────

function SecretCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center gap-2.5">
        <div className="skeleton w-8 h-8 rounded-lg" />
        <div className="flex-1">
          <div className="skeleton h-4 w-32 mb-1.5" />
          <div className="skeleton h-3 w-20" />
        </div>
        <div className="skeleton h-3 w-16" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="skeleton h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ── Secret Card ─────────────────────────────────────────────────────

function SecretCard({ secret }: { secret: Secret }) {
  const [qrAddress, setQrAddress] = useState<{ address: string; label: string } | null>(null);
  const addresses = getAddresses(secret);

  return (
    <>
      <Link
        to={`/secrets/${secret.id}`}
        className="block bg-card rounded-lg border border-border hover:border-primary/40 transition-colors"
      >
        <div className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                {secret.type === 'DATA_SOURCES' ? (
                  <DataSourceIcon className="w-[18px] h-[18px] text-primary" />
                ) : (
                  <WalletIcon className="w-[18px] h-[18px] text-primary" />
                )}
              </div>
              <div>
                <span className="text-foreground font-medium block leading-tight">
                  {secret.memo || 'Unnamed secret'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {secret.type.replace('_', ' ')}
                </span>
              </div>
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {new Date(secret.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {addresses.length > 0 && (
          <div className="px-4 pt-3 pb-3 space-y-2">
            {addresses.map((a) => (
              <div key={a.address} className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-muted-foreground shrink-0">{a.label}</span>
                  <code className="text-sm text-foreground/80 font-mono" title={a.address}>
                    {truncateAddress(a.address)}
                  </code>
                  <CopyButton text={a.address} />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setQrAddress(a);
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border border-border bg-muted text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-150"
                  >
                    <ReceiveIcon className="w-3 h-3" />
                    Receive
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Link>

      {qrAddress && (
        <QrModal
          address={qrAddress.address}
          label={qrAddress.label}
          onClose={() => setQrAddress(null)}
        />
      )}
    </>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────

export default function Dashboard() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [deployments, setDeployments] = useState<{ id: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState('EVM_WALLET');
  const [createMemo, setCreateMemo] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      getUserSecrets()
        .then((res) => setSecrets(res.data.data.secrets))
        .catch(() => {}),
      getOpenClawDeployments()
        .then((res) => setDeployments(res.data.data.deployments))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const loadSecrets = () => {
    getUserSecrets()
      .then((res) => setSecrets(res.data.data.secrets))
      .catch(() => {});
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployError(null);
    try {
      const currentUrl = window.location.origin + '/agents';
      const res = await deployOpenClaw(
        `${currentUrl}?openclaw_deploy=success`,
        `${currentUrl}?openclaw_deploy=canceled`
      );
      const { checkoutUrl } = res.data.data;
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setDeployError(msg || 'Failed to start deployment');
      setDeploying(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createSecret(createType, createMemo || undefined);
      const { secret, apiKey, claimUrl } = res.data.data;

      const url = new URL(claimUrl, window.location.origin);
      const token = url.searchParams.get('token');
      if (token) {
        await claimSecret(secret.id, token);
      }

      setCreatedKey(apiKey.key);
      setCreateMemo('');
      toast('Secret created successfully');
      loadSecrets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      setCreateError(msg || 'Failed to create secret');
    } finally {
      setCreating(false);
    }
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreatedKey(null);
    setCreateError(null);
    setCreateMemo('');
  };

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-9 w-32 rounded-lg" />
        </div>
        <div className="grid gap-4">
          <SecretCardSkeleton />
          <SecretCardSkeleton />
        </div>
      </div>
    );
  }

  const hasDeployments = deployments.some((d) => d.status !== 'DESTROYED');
  const hasSecrets = secrets.length > 0;

  if (!hasDeployments && !hasSecrets) {
    return (
      <WelcomeOnboarding
        onDeploy={handleDeploy}
        deploying={deploying}
        error={deployError}
        onCreateSecret={() => setShowCreate(true)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          + Create Secret
        </button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          {createdKey ? (
            <div>
              <h3 className="font-medium text-green-400 mb-2">Secret created!</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Save this API key now — it won't be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-3 py-1.5 rounded text-sm flex-1 break-all text-foreground">
                  {createdKey}
                </code>
                <CopyButton text={createdKey} variant="button" label="Copy" />
              </div>
              <button
                onClick={closeCreate}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div>
              <h3 className="font-medium text-foreground mb-3">Create a new secret</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Type</label>
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value)}
                    className="bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground"
                  >
                    <option value="EVM_WALLET">EVM Wallet</option>
                    <option value="POLYMARKET_WALLET">Polymarket Wallet</option>
                    <option value="RAW_SIGNER">Raw Signer</option>
                    <option value="DATA_SOURCES">Data Sources</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-muted-foreground mb-1">
                    Memo (optional)
                  </label>
                  <input
                    type="text"
                    value={createMemo}
                    onChange={(e) => setCreateMemo(e.target.value)}
                    placeholder="e.g. My trading bot wallet"
                    className="bg-background border border-border rounded px-3 py-1.5 text-sm w-full text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={closeCreate}
                    className="text-muted-foreground px-3 py-1.5 text-sm hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {createError && <p className="text-destructive text-sm mt-2">{createError}</p>}
            </div>
          )}
        </div>
      )}

      {secrets.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-10 text-center">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
            />
          </svg>
          <p className="text-foreground font-medium mb-1">No secrets yet</p>
          <p className="text-sm text-muted-foreground">
            Create one above or claim one from an agent to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {secrets.map((s) => (
            <SecretCard key={s.id} secret={s} />
          ))}
        </div>
      )}
    </div>
  );
}
