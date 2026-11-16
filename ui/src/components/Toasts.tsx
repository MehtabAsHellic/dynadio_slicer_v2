import { useApp } from '../state';
import { Icon, type IconName } from './Icon';

const ICONS: Record<string, IconName> = {
  success: 'check-circle',
  error: 'warning',
  warning: 'warning',
  info: 'info',
};

export function Toasts() {
  const app = useApp();
  return (
    <div className="toasts" aria-live="polite" aria-label="Notifications">
      {app.toasts.map((toast) => (
        <div className={`toast ${toast.kind}`} key={toast.id} role="status">
          <span className="toast-icon">
            <Icon name={ICONS[toast.kind] ?? 'info'} size={15} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="toast-title">{toast.title}</div>
            {toast.message ? <div className="toast-message">{toast.message}</div> : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss notification"
            title="Dismiss"
            onClick={() => app.dismissToast(toast.id)}
            style={{ width: 26, height: 26, flex: 'none' }}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}