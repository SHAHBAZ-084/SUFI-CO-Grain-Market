import { useEffect, useRef, useState } from 'react';

export type SearchSelectOption = { value: string; label: string };

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = debouncedQuery.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(debouncedQuery.trim().toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        disabled={disabled}
        value={open ? query : selected?.label ?? ''}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none ring-grain-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-100"
      />
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-400">No matches</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery('');
                }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-grain-50 ${
                  o.value === value ? 'bg-grain-50 font-medium text-grain-800' : 'text-stone-700'
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
