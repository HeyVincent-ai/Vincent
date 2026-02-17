import { useState, useEffect } from 'react';
import { createSecret, claimSecret } from '../api';
import { CloseIcon, ArrowLeftIcon } from './icons';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_ORDER } from './accountTypes';

interface CreateAccountModalProps {
  onClose: () => void;
  onCreated: (apiKey: string) => void;
}

export default function CreateAccountModal({ onClose, onCreated }: CreateAccountModalProps) {
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'configure' && !creating) {
          setStep('select');
          setSelectedType(null);
          setMemo('');
          setError(null);
        } else if (step === 'select') {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, creating, onClose]);

  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setStep('configure');
    setError(null);
  };

  const handleBack = () => {
    setStep('select');
    setSelectedType(null);
    setMemo('');
    setError(null);
  };

  const handleCreate = async () => {
    if (!selectedType) return;
    setCreating(true);
    setError(null);
    try {
      const res = await createSecret(selectedType, memo || undefined);
      const { secret, apiKey, claimUrl } = res.data.data;

      const url = new URL(claimUrl, window.location.origin);
      const token = url.searchParams.get('token');
      if (token) {
        await claimSecret(secret.id, token);
      }

      onCreated(apiKey.key);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      setError(msg || 'Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  const typeConfig = selectedType ? ACCOUNT_TYPES[selectedType] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={step === 'select' ? onClose : undefined}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'select' ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">New Account</h3>
              <button
                onClick={onClose}
                className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground/50 mb-4">
              Choose the type of account to create.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACCOUNT_TYPE_ORDER.map((type) => {
                const config = ACCOUNT_TYPES[type];
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => handleSelectType(type)}
                    className="text-left rounded-lg p-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <Icon className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                      <span className="text-sm font-medium text-foreground">{config.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/40 leading-relaxed pl-6.5">
                      {config.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={handleBack}
                disabled={creating}
                className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 disabled:opacity-50"
              >
                <ArrowLeftIcon className="w-4 h-4" />
              </button>
              {typeConfig && (
                <div className="flex items-center gap-2">
                  <typeConfig.icon className="w-4 h-4 text-muted-foreground/60" />
                  <h3 className="text-sm font-medium text-foreground">New {typeConfig.label}</h3>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Name <span className="text-muted-foreground/40 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={typeConfig?.memoPlaceholder || 'e.g. My account'}
                className="bg-background border border-border/50 rounded-lg px-3 py-2 text-sm w-full text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creating) handleCreate();
                }}
              />
            </div>

            {error && <p className="text-destructive text-xs mb-3">{error}</p>}

            <div className="flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create Account'}
              </button>
              <button
                onClick={onClose}
                disabled={creating}
                className="text-muted-foreground/40 text-xs hover:text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
