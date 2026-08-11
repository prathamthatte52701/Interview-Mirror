import { useState } from 'react';
import { Check, Copy, ShieldAlert } from 'lucide-react';

export default function RecoveryCodeCard({ code, title, description, continueLabel, onContinue }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the code is still visible to copy by hand.
    }
  }

  return (
    <div className="auth-card-header">
      <span className="auth-card-kicker">
        <ShieldAlert size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
        Save this now
      </span>
      <h2>{title}</h2>
      <p>{description}</p>

      <div className="auth-recovery-code" role="group" aria-label="Recovery code">
        <code>{code}</code>
        <button type="button" className="auth-recovery-copy" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="auth-recovery-warning">
        This code will not be shown again. Store it somewhere safe — you'll need it to reset
        your password if you ever forget it.
      </p>

      <button type="button" className="auth-submit" onClick={onContinue}>
        {continueLabel}
      </button>
    </div>
  );
}
