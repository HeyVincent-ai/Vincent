import { useState, useEffect, useRef, useCallback } from 'react';
import { Core } from '@walletconnect/core';
import { WalletKit, type WalletKitTypes } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { useSignMessage, useSignTypedData } from 'wagmi';
import { useToast } from './Toast';
import { executeWalletConnectTx } from '../api';

// ── Types ────────────────────────────────────────────────────────────

interface Props {
  secretId: string;
  walletAddress: string;
}

interface SessionInfo {
  topic: string;
  peerName: string;
  peerUrl: string;
  peerIcon?: string;
}

interface PendingRequest {
  id: number;
  topic: string;
  method: string;
  chainId: number;
  params: any;
}

// ── Constants ────────────────────────────────────────────────────────

const SUPPORTED_CHAINS = [1, 8453, 84532, 11155111, 137, 42161, 10];
const SUPPORTED_METHODS = [
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData_v4',
  'eth_accounts',
  'eth_chainId',
];
const SUPPORTED_EVENTS = ['chainChanged', 'accountsChanged'];

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  84532: 'Base Sepolia',
  11155111: 'Sepolia',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
};

// ── Component ────────────────────────────────────────────────────────

export default function WalletConnectManager({ secretId, walletAddress }: Props) {
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();

  const walletKitRef = useRef<InstanceType<typeof WalletKit> | null>(null);
  const initializingRef = useRef(false);

  const [uri, setUri] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [executing, setExecuting] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────

  const refreshSessions = useCallback(() => {
    const wk = walletKitRef.current;
    if (!wk) return;
    const active = wk.getActiveSessions();
    const list: SessionInfo[] = Object.values(active).map((s: any) => ({
      topic: s.topic,
      peerName: s.peer?.metadata?.name || 'Unknown dApp',
      peerUrl: s.peer?.metadata?.url || '',
      peerIcon: s.peer?.metadata?.icons?.[0],
    }));
    setSessions(list);
  }, []);

  // ── Session proposal handler ────────────────────────────────────

  const onSessionProposal = useCallback(
    async (proposal: WalletKitTypes.SessionProposal) => {
      const wk = walletKitRef.current;
      if (!wk) return;

      try {
        const accounts = SUPPORTED_CHAINS.map(
          (c) => `eip155:${c}:${walletAddress}`
        );
        const chains = SUPPORTED_CHAINS.map((c) => `eip155:${c}`);

        const approvedNamespaces = buildApprovedNamespaces({
          proposal: proposal.params,
          supportedNamespaces: {
            eip155: {
              chains,
              methods: SUPPORTED_METHODS,
              events: SUPPORTED_EVENTS,
              accounts,
            },
          },
        });

        await wk.approveSession({
          id: proposal.id,
          namespaces: approvedNamespaces,
        });

        refreshSessions();
        toast('Connected to dApp', 'success');
      } catch (err: any) {
        console.error('Failed to approve session:', err);
        try {
          await wk.rejectSession({
            id: proposal.id,
            reason: getSdkError('USER_REJECTED'),
          });
        } catch {
          // ignore reject errors
        }
        toast(err.message || 'Failed to connect', 'error');
      }
    },
    [walletAddress, refreshSessions, toast]
  );

  // ── Session request handler ─────────────────────────────────────

  const onSessionRequest = useCallback(
    async (event: WalletKitTypes.SessionRequest) => {
      const wk = walletKitRef.current;
      if (!wk) return;

      const { id, topic, params } = event;
      const { request, chainId: caipChainId } = params;
      const chainId = parseInt(caipChainId.split(':')[1], 10);

      switch (request.method) {
        case 'eth_accounts':
          await wk.respondSessionRequest({
            topic,
            response: { id, jsonrpc: '2.0', result: [walletAddress] },
          });
          break;

        case 'eth_chainId':
          await wk.respondSessionRequest({
            topic,
            response: { id, jsonrpc: '2.0', result: `0x${chainId.toString(16)}` },
          });
          break;

        case 'eth_sendTransaction':
        case 'personal_sign':
        case 'eth_signTypedData_v4':
          setPendingRequest({ id, topic, method: request.method, chainId, params: request.params });
          break;

        default:
          await wk.respondSessionRequest({
            topic,
            response: {
              id,
              jsonrpc: '2.0',
              error: { code: 4200, message: `Unsupported method: ${request.method}` },
            },
          });
      }
    },
    [walletAddress]
  );

  // ── Session delete handler ──────────────────────────────────────

  const onSessionDelete = useCallback(() => {
    refreshSessions();
  }, [refreshSessions]);

  // ── Init WalletKit ──────────────────────────────────────────────

  useEffect(() => {
    if (walletKitRef.current || initializingRef.current) return;
    initializingRef.current = true;

    const projectId = (import.meta as any).env.VITE_WALLETCONNECT_PROJECT_ID || '';

    (async () => {
      try {
        const core = new Core({ projectId });
        const wk = await WalletKit.init({
          core,
          metadata: {
            name: 'Vincent',
            description: 'Vincent Smart Wallet',
            url: window.location.origin,
            icons: [],
          },
        });

        walletKitRef.current = wk;

        wk.on('session_proposal', onSessionProposal);
        wk.on('session_request', onSessionRequest);
        wk.on('session_delete', onSessionDelete);

        refreshSessions();
      } catch (err) {
        console.error('Failed to initialize WalletKit:', err);
        initializingRef.current = false;
      }
    })();

    return () => {
      const wk = walletKitRef.current;
      if (wk) {
        wk.off('session_proposal', onSessionProposal);
        wk.off('session_request', onSessionRequest);
        wk.off('session_delete', onSessionDelete);
      }
    };
  }, [onSessionProposal, onSessionRequest, onSessionDelete, refreshSessions]);

  // ── Pair with dApp ──────────────────────────────────────────────

  const handleConnect = async () => {
    const wk = walletKitRef.current;
    if (!wk || !uri.trim()) return;

    setConnecting(true);
    try {
      await wk.pair({ uri: uri.trim() });
      setUri('');
    } catch (err: any) {
      toast(err.message || 'Failed to pair', 'error');
    } finally {
      setConnecting(false);
    }
  };

  // ── Disconnect session ──────────────────────────────────────────

  const handleDisconnect = async (topic: string) => {
    const wk = walletKitRef.current;
    if (!wk) return;

    try {
      await wk.disconnectSession({
        topic,
        reason: getSdkError('USER_DISCONNECTED'),
      });
      refreshSessions();
      toast('Disconnected', 'info');
    } catch (err: any) {
      toast(err.message || 'Failed to disconnect', 'error');
    }
  };

  // ── Approve pending request ─────────────────────────────────────

  const handleApprove = async () => {
    const wk = walletKitRef.current;
    if (!wk || !pendingRequest) return;

    setExecuting(true);
    try {
      let result: string;

      switch (pendingRequest.method) {
        case 'eth_sendTransaction': {
          const tx = pendingRequest.params[0];
          const res = await executeWalletConnectTx(secretId, {
            to: tx.to,
            data: tx.data || '0x',
            value: tx.value || '0x0',
            chainId: pendingRequest.chainId,
          });
          result = res.data.data.txHash;
          break;
        }

        case 'personal_sign': {
          const message = pendingRequest.params[0];
          result = await signMessageAsync({ message: { raw: message as `0x${string}` } });
          break;
        }

        case 'eth_signTypedData_v4': {
          const typedData = JSON.parse(pendingRequest.params[1]);
          result = await signTypedDataAsync({
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
          break;
        }

        default:
          throw new Error(`Unsupported method: ${pendingRequest.method}`);
      }

      await wk.respondSessionRequest({
        topic: pendingRequest.topic,
        response: { id: pendingRequest.id, jsonrpc: '2.0', result },
      });

      toast('Request approved', 'success');
    } catch (err: any) {
      console.error('Failed to handle request:', err);

      // If user rejected signing, notify the dApp
      if (err.code === 4001 || err.message?.includes('rejected')) {
        await wk.respondSessionRequest({
          topic: pendingRequest.topic,
          response: {
            id: pendingRequest.id,
            jsonrpc: '2.0',
            error: { code: 4001, message: 'User rejected' },
          },
        });
        toast('Request rejected', 'info');
      } else {
        await wk.respondSessionRequest({
          topic: pendingRequest.topic,
          response: {
            id: pendingRequest.id,
            jsonrpc: '2.0',
            error: { code: -32000, message: err.message || 'Execution failed' },
          },
        });
        toast(err.message || 'Request failed', 'error');
      }
    } finally {
      setExecuting(false);
      setPendingRequest(null);
    }
  };

  // ── Reject pending request ──────────────────────────────────────

  const handleReject = async () => {
    const wk = walletKitRef.current;
    if (!wk || !pendingRequest) return;

    await wk.respondSessionRequest({
      topic: pendingRequest.topic,
      response: {
        id: pendingRequest.id,
        jsonrpc: '2.0',
        error: { code: 4001, message: 'User rejected' },
      },
    });

    setPendingRequest(null);
    toast('Request rejected', 'info');
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="bg-muted/50 border border-border rounded p-3">
        <p className="text-sm text-muted-foreground">
          Connect to dApps like{' '}
          <a
            href="https://app.zerion.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Zerion
          </a>{' '}
          to manage your funds. Copy the WalletConnect URI from the dApp and paste it below.
        </p>
      </div>

      {/* URI Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          placeholder="wc:..."
          className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleConnect}
          disabled={connecting || !uri.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
      </div>

      {/* Active Sessions */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Active Sessions
          </p>
          {sessions.map((s) => (
            <div
              key={s.topic}
              className="flex items-center justify-between bg-muted/30 border border-border rounded p-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                {s.peerIcon && (
                  <img
                    src={s.peerIcon}
                    alt=""
                    className="w-5 h-5 rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.peerName}</p>
                  {s.peerUrl && (
                    <p className="text-xs text-muted-foreground truncate">{s.peerUrl}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDisconnect(s.topic)}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending Request Modal */}
      {pendingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-semibold text-foreground mb-4">
              {pendingRequest.method === 'eth_sendTransaction'
                ? 'Approve Transaction'
                : pendingRequest.method === 'personal_sign'
                  ? 'Sign Message'
                  : 'Sign Typed Data'}
            </h3>

            <div className="space-y-3 mb-6">
              <div className="bg-muted/50 border border-border rounded p-3 text-xs space-y-2">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Chain:</span>{' '}
                  {CHAIN_NAMES[pendingRequest.chainId] || `Chain ${pendingRequest.chainId}`}
                </p>

                {pendingRequest.method === 'eth_sendTransaction' && (
                  <>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">To:</span>{' '}
                      <code className="bg-muted px-1 rounded">{pendingRequest.params[0]?.to}</code>
                    </p>
                    {pendingRequest.params[0]?.value &&
                      pendingRequest.params[0].value !== '0x0' &&
                      pendingRequest.params[0].value !== '0x' && (
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Value:</span>{' '}
                          {pendingRequest.params[0].value}
                        </p>
                      )}
                    {pendingRequest.params[0]?.data &&
                      pendingRequest.params[0].data !== '0x' && (
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Data:</span>{' '}
                          <code className="bg-muted px-1 rounded break-all">
                            {pendingRequest.params[0].data.slice(0, 66)}
                            {pendingRequest.params[0].data.length > 66 ? '...' : ''}
                          </code>
                        </p>
                      )}
                  </>
                )}

                {pendingRequest.method === 'personal_sign' && (
                  <p className="text-muted-foreground break-all">
                    <span className="font-medium text-foreground">Message:</span>{' '}
                    {(() => {
                      try {
                        // Try to decode hex message to UTF-8
                        const hex = pendingRequest.params[0] as string;
                        const bytes = new Uint8Array(
                          hex
                            .slice(2)
                            .match(/.{1,2}/g)!
                            .map((b: string) => parseInt(b, 16))
                        );
                        return new TextDecoder().decode(bytes);
                      } catch {
                        return pendingRequest.params[0];
                      }
                    })()}
                  </p>
                )}

                {pendingRequest.method === 'eth_signTypedData_v4' && (
                  <pre className="text-muted-foreground overflow-auto max-h-40 text-[10px]">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(pendingRequest.params[1]), null, 2);
                      } catch {
                        return pendingRequest.params[1];
                      }
                    })()}
                  </pre>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={executing}
                className="flex-1 border border-border text-foreground px-4 py-2 rounded text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={executing}
                className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {executing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Approve'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
