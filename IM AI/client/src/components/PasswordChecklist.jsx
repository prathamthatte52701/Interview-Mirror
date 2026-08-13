import { Check, X } from 'lucide-react';

const PASSWORD_RULES = [
  { key: 'length', label: '8-64 characters' },
  { key: 'uppercase', label: '1 uppercase' },
  { key: 'lowercase', label: '1 lowercase' },
  { key: 'number', label: '1 number' },
  { key: 'special', label: '1 special character' }
];

export function PasswordStrengthMeter({ status }) {
  const metCount = Object.values(status).filter(Boolean).length;
  const level = metCount >= 5 ? 'strong' : metCount >= 3 ? 'fair' : 'weak';
  const label = { weak: 'Weak', fair: 'Fair', strong: 'Strong' }[level];

  return (
    <div className="auth-strength" aria-hidden="true">
      <div className="auth-strength-track">
        <div
          className={`auth-strength-fill is-${level}`}
          style={{ width: `${(metCount / 5) * 100}%` }}
        />
      </div>
      <span className={`auth-strength-label is-${level}`}>{label}</span>
    </div>
  );
}

export default function PasswordChecklist({ status }) {
  return (
    <div className="auth-password-rules" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const passed = status[rule.key];
        return (
          <span key={rule.key} className={passed ? 'is-met' : ''}>
            {passed ? <Check size={13} /> : <X size={13} />}
            {rule.label}
          </span>
        );
      })}
    </div>
  );
}
