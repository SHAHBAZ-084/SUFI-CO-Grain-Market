import type { ReactNode } from 'react';

/** Minimum visible body rows so the preview grid does not collapse before first entry. */
export const INVOICE_GRID_MIN_VISIBLE_ROWS = 3;

export function InvoicePreviewGridShell({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-40 min-h-[7.75rem] overflow-auto rounded-lg border border-border/60">
      {children}
    </div>
  );
}

export function InvoiceGridPlaceholderRows({
  columnCount,
  dataRowCount,
  minRows = INVOICE_GRID_MIN_VISIBLE_ROWS,
}: {
  columnCount: number;
  dataRowCount: number;
  minRows?: number;
}) {
  const placeholderCount = Math.max(0, minRows - dataRowCount);
  return Array.from({ length: placeholderCount }, (_, rowIndex) => (
    <tr
      key={`grid-placeholder-${rowIndex}`}
      className="border-b border-border/40"
      aria-hidden="true"
    >
      {Array.from({ length: columnCount }, (_, colIndex) => (
        <td key={colIndex} className="px-3 py-2">
          {'\u00A0'}
        </td>
      ))}
    </tr>
  ));
}
