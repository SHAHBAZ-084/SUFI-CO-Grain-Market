import { forwardRef, ReactNode, RefObject } from 'react';

type PageShellProps = {
  title: string;
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
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col items-center gap-4">
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="rounded-sm text-center text-2xl font-semibold text-onCanvas outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface3"
          >
            {title}
          </h1>
          {actions ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-onCanvas">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-onCanvasMuted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Metric / grouped summary tile (dashboard style). */
export function Tile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-borderStrong bg-surface2 p-3 shadow-md ${className}`}>
      {children}
    </div>
  );
}

/** Raised form card. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-borderStrong bg-surface2 p-5 shadow-md ${className}`}>
      {children}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-textSecondary">{children}</label>;
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput(props, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={`w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary outline-none ring-accent focus:ring-2 ${props.className ?? ''}`}
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
      className={`rounded-lg px-3 py-2 text-sm font-medium text-textSecondary transition hover:bg-surface1 hover:text-textPrimary disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ''}`}
    />
  );
}

export function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg border border-border bg-surface1 px-4 py-2 text-sm font-medium text-danger transition hover:bg-bgDanger disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ''}`}
    />
  );
}
