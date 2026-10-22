import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A modal that asks before anything destructive. Cancel has focus on open, so Enter, Space and Escape never
 * confirm; focus stays inside and goes back to where it was on close.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  busy = false,
  extra,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  /** While running: no Cancel or Delete, no closing. */
  busy?: boolean;
  /** Extra controls shown while busy (e.g. Stop). */
  extra?: ReactNode;
}) {
  const titleId = useId();
  const bodyId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  // The app behind can't be clicked, tabbed to or read out while the question is open.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const app = document.getElementById('root');
    if (app) app.inert = true;
    cancel.current?.focus();
    return () => {
      if (app) app.inert = false;
      before?.focus?.();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (!busy) onCancel();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Outside #root, which is made inert while this is open.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} ref={box} onKeyDown={onKeyDown}>
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <div id={bodyId} className="modal-body">
          {children}
        </div>
        <div className="modal-actions">
          {busy ? (
            extra
          ) : (
            <>
              <button ref={cancel} type="button" className="btn btn-quiet" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={confirmDisabled}>
                {confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
