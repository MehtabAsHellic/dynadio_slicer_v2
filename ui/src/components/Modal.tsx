import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal shell: Escape closes, focus moves inside, Tab is trapped
 * and the previous focus is restored on close.
 */
export function Modal({ title, subtitle, icon, onClose, children, footer, width }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // Everything behind the dialog is inert while it is open, so neither Tab
    // nor a screen reader can wander into controls the user cannot see.
    const overlay = panel?.closest('.modal-overlay');
    const behind: HTMLElement[] = [];
    const appRoot = panel?.closest('.app');
    if (appRoot) {
      for (const child of Array.from(appRoot.children) as HTMLElement[]) {
        if (child === overlay || child.classList.contains('toasts')) continue;
        if (!child.hasAttribute('inert')) {
          child.setAttribute('inert', '');
          behind.push(child);
        }
      }
    }
    const focusFirst = () => {
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel)?.focus();
    };
    const timer = window.setTimeout(focusFirst, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown, true);
      behind.forEach((element) => element.removeAttribute('inert'));
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        ref={panelRef}
        tabIndex={-1}
        style={width ? { width: `min(${width}px, calc(100vw - 48px))` } : undefined}
      >
        <div className="modal-head">
          {icon ? <span style={{ color: 'var(--blue-text)', marginTop: 1 }}>{icon}</span> : null}
          <div style={{ minWidth: 0 }}>
            <div className="title" id={titleId}>
              {title}
            </div>
            {subtitle ? (
              <div className="sub" id={subtitleId}>
                {subtitle}
              </div>
            ) : null}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}