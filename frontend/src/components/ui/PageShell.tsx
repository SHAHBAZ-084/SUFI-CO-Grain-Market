import { forwardRef, ReactNode, RefObject } from 'react';

type PageShellProps = {
  title?: ReactNode;
  subtitle?: string;
  children?: ReactNode;
  actions?: ReactNode;
  centerTitle?: boolean;
  titleRef?: RefObject<HTMLHeadingElement | null>;
};

export function PageShell({
  title,
  subtitle,
  children,
  actions,
  centerTitle = false,
  titleRef,
}: PageShellProps) {
  if (centerTitle) {
    return (
      <div className="app-page">
        <div className="mb-4 flex flex-col items-center gap-3 border-b border-border bg-surface2 px-4 py-4">
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="app-brand-serif text-center text-xl text-textPrimary outline-none"
          >
            {title}
          </h1>
          {actions ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null}
        </div>
        <div className="app-page-body">{children}</div>
      </div>
    );
  }

  return (
    <div className="app-page">
      {subtitle || actions ? (
        <div className="app-page-toolbar">
          <div>
            {subtitle ? <p className="text-sm text-textSecondary">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="app-page-body">{children}</div>
    </div>
  );
}

/** Flat bordered summary block. */
export function Tile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-border bg-surface2 p-3 ${className}`}>{children}</div>
  );
}

/** Form / content panel — white, sharp corners. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-border bg-surface2 p-4 ${className}`}>{children}</div>;
}

export function LegacyTable({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto border border-border ${className}`}>
      <table className="legacy-table">{children}</table>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-textSecondary">
      {children}
    </label>
  );
}

export function FormRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-1 border-b border-border py-2 sm:grid-cols-[140px_1fr] sm:gap-4">
      <div className="text-sm font-medium text-textPrimary">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput(props, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={`w-full rounded-sm border border-border bg-surface2 px-2.5 py-1.5 text-sm text-textPrimary outline-none focus:border-borderStrong ${props.className ?? ''}`}
      />
    );
  },
);

export const FinancialButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function FinancialButton(props, ref) {
    const { className = '', ...rest } = props;
    return (
      <button
        ref={ref}
        {...rest}
        className={`btn-financial disabled:cursor-not-allowed ${className}`}
      />
    );
  },
);

export const PrimaryButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function PrimaryButton(props, ref) {
    const { className = '', ...rest } = props;
    return (
      <button
        ref={ref}
        {...rest}
        className={`btn-primary disabled:cursor-not-allowed ${className}`}
      />
    );
  },
);

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`btn-secondary ${className}`}
    />
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-sm px-2.5 py-1.5 text-sm font-medium text-textSecondary hover:bg-surface1 hover:text-textPrimary disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ''}`}
    />
  );
}

export function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-sm border border-danger bg-surface2 px-3 py-1.5 text-sm font-semibold text-danger hover:bg-bgDanger disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ''}`}
    />
  );
}
