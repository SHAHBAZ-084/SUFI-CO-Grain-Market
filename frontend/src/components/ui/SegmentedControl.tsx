export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-lg border border-border bg-surface1 p-0.5 sm:w-auto"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:flex-none ${
              selected
                ? 'bg-surface2 text-textPrimary shadow-sm'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
