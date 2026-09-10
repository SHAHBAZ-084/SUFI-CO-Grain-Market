import type { ReactNode, MouseEvent } from 'react';
import { useEffect } from 'react';
import { Panel, SecondaryButton } from './PageShell';

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind max-width class. Default: max-w-2xl */
  maxWidthClassName?: string;
};

/**
 * Shared centered modal — same overlay treatment as the Pending Approvals edit dialog.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-md',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function onOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onOverlayClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full ${maxWidthClassName} overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <Panel className="shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-textPrimary">{title}</h2>
            <SecondaryButton type="button" onClick={onClose}>
              Close
            </SecondaryButton>
          </div>
          {children}
          {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </Panel>
      </div>
    </div>
  );
}
