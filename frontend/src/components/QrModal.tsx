import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ReceiveIcon, CloseIcon } from './icons';
import CopyButton from './CopyButton';

interface QrModalProps {
  address: string;
  label: string;
  onClose: () => void;
}

export default function QrModal({ address, label, onClose }: QrModalProps) {
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
            <CloseIcon className="w-5 h-5" />
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
