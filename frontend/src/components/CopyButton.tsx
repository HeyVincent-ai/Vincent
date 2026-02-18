import { useState, useRef } from 'react';
import { CopyIcon, CheckIcon } from './icons';

interface CopyButtonProps {
  text: string;
  label?: string;
  variant?: 'icon' | 'button';
}

export default function CopyButton({ text, label, variant = 'icon' }: CopyButtonProps) {
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
