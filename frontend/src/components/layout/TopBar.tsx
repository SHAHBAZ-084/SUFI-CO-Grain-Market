import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TOP_NAV, NavItem } from '../../config/navigation';

function NavSubmenu({ label, children }: { label: string; children: { label: string; to: string; description?: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-stone-700 transition hover:bg-grain-50 hover:text-grain-800"
      >
        {label}
        <span className="ml-2 text-stone-400">›</span>
      </button>
      {open ? (
        <div className="absolute left-full top-0 z-50 min-w-[220px] rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {children.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block px-4 py-2 text-sm text-stone-700 transition hover:bg-grain-50 hover:text-grain-800"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavDropdown({ label, children }: { label: string; children: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md px-3 py-2 text-sm font-medium text-stone-100 transition hover:bg-grain-700"
      >
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {children.map((item) =>
            item.kind === 'submenu' ? (
              <NavSubmenu key={item.label} label={item.label} children={item.children} />
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className="block px-4 py-2 text-sm text-stone-700 transition hover:bg-grain-50 hover:text-grain-800"
              >
                {item.label}
              </Link>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-grain-800 bg-grain-900 shadow-md">
      <div className="flex items-center gap-1 px-3">
        <Link to="/" className="mr-3 shrink-0 py-3 pr-3 text-sm font-semibold text-white">
          Grain Market POS
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-0.5">
          {TOP_NAV.map((group) =>
            group.children ? (
              <NavDropdown key={group.label} label={group.label} children={group.children} />
            ) : (
              <Link
                key={group.label}
                to={group.to!}
                className="rounded-md px-3 py-2 text-sm font-medium text-stone-100 transition hover:bg-grain-700"
              >
                {group.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </header>
  );
}
