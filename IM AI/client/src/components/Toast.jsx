import { AlertTriangle, Check, X } from 'lucide-react';
import { useToast } from '../hooks/useToast.js';

const ICONS = {
  success: Check,
  error: X,
  warning: AlertTriangle
};

export default function ToastHost() {
  const { toasts } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="toast-stack">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant] || Check;
        return (
          <div key={toast.id} className={`toast toast--${toast.variant}`} role="status" aria-live="polite">
            <Icon size={16} />
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
