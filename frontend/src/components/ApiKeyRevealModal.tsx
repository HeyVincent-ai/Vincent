import { useEffect } from 'react';
import { CheckIcon } from './icons';
import CopyButton from './CopyButton';

interface ApiKeyRevealModalProps {
  apiKey: string;
  onDone: () => void;
}

export default function ApiKeyRevealModal({ apiKey, onDone }: ApiKeyRevealModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <CheckIcon className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-medium text-foreground">Account Created</h3>
        </div>

        <p className="text-xs text-muted-foreground/50 mb-3">
          Save this API key now — it won't be shown again.
        </p>

        <div className="bg-muted/50 rounded-lg p-3 mb-4">
          <code className="text-xs text-foreground font-mono break-all block">{apiKey}</code>
        </div>

        <div className="flex items-center gap-3">
          <CopyButton text={apiKey} variant="button" label="Copy API Key" />
          <button
            onClick={onDone}
            className="text-xs text-muted-foreground/40 hover:text-foreground transition-colors ml-auto"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
