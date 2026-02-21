import { useEffect, useState } from 'react';
import { getReferral } from '../api';
import { copyToClipboard } from '../utils/format';

export default function ReferralBanner() {
  const [referralLink, setReferralLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('referralBannerDismissed') === '1';
  });

  useEffect(() => {
    if (dismissed) return;
    getReferral()
      .then((res) => setReferralLink(res.data.data.referralLink))
      .catch(() => {});
  }, [dismissed]);

  if (dismissed || !referralLink) return null;

  const handleCopy = async () => {
    await copyToClipboard(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('referralBannerDismissed', '1');
  };

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
      <span className="text-foreground">
        Refer a friend, get <strong className="text-primary">$10 in free credits</strong>
      </span>
      <button
        onClick={handleCopy}
        className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        {copied ? 'Link copied!' : 'Copy link'}
      </button>
      <button
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors ml-1"
        aria-label="Dismiss"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
