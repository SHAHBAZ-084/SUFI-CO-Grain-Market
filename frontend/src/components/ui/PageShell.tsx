import { ReactNode } from 'react';

type PageShellProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  actions?: ReactNode;
};

export function PageShell({ title, subtitle, children, actions }: PageShellProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-stone-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-8 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-stone-700">{children}</label>;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none ring-grain-500 focus:ring-2 ${props.className ?? ''}`}
    />
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg bg-grain-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-grain-700 disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ''}`}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ''}`}
    />
  );
}

export function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ''}`}
    />
  );
}
