import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SIDEBAR_NAV, NavItem, sectionIsActive } from '../../config/navigation';
import { api } from '../../lib/api';
import { APPROVALS_CHANGED_EVENT } from '../../lib/approvals';
import { voucherTypeColorClass } from '../../lib/format';

function voucherNavLabelClass(label: string) {
  if (label.startsWith('Payment')) return voucherTypeColorClass('PAYMENT');
  if (label.startsWith('Receipt')) return voucherTypeColorClass('RECEIPT');
  if (label.startsWith('Journal')) return voucherTypeColorClass('JOURNAL');
  return '';
}

function NavSubmenu({
  label,
  children,
}: {
  label: string;
  children: { label: string; to: string; description?: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-dropdown-item flex w-full items-center justify-between text-left"
      >
        {label}
        <span className="ml-2 text-textMuted">›</span>
      </button>
      {open ? (
        <div className="app-dropdown left-full top-0">
          {children.map((item) => (
            <Link key={item.to} to={item.to} className="app-dropdown-item">
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavDropdown({
  label,
  children,
  active,
}: {
  label: string;
  children: NavItem[];
  active: boolean;
}) {
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
        className={`app-topnav-link ${open || active ? 'is-active' : ''}`}
      >
        {label}
      </button>
      {open ? (
        <div className="app-dropdown left-0 top-full mt-1">
          {children.map((item) =>
            item.kind === 'submenu' ? (
              <NavSubmenu key={item.label} label={item.label} children={item.children} />
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className={`app-dropdown-item ${voucherNavLabelClass(item.label)}`}
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

function PendingApprovalsNavLink({ active }: { active: boolean }) {
  const location = useLocation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const rows = await api.listPendingApprovals();
        if (!cancelled) setCount(rows.length);
      } catch {
        if (!cancelled) setCount(0);
      }
    }
    void refresh();
    window.addEventListener(APPROVALS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(APPROVALS_CHANGED_EVENT, refresh);
    };
  }, [location.pathname]);

  return (
    <Link
      to="/approvals"
      className={`app-topnav-link ${active ? 'is-active' : ''}`}
    >
      Pending Approvals
      {count > 0 ? (
        <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

export function TopBar() {
  const location = useLocation();
  const dashboardActive = location.pathname === '/';
  const approvalsActive = location.pathname === '/approvals';

  return (
    <header className="app-topnav">
      <div className="app-topnav-inner">
        <Link to="/" className="app-topnav-brand" aria-label="Sufi & Co — Dashboard">
          <img src="/sufi-co-logo.png" alt="" className="app-topnav-brand-logo" />
          <span className="app-topnav-brand-text">Grain Market POS</span>
        </Link>

        <nav className="app-topnav-nav">
          <Link to="/" className={`app-topnav-link ${dashboardActive ? 'is-active' : ''}`}>
            Dashboard
          </Link>

          <PendingApprovalsNavLink active={approvalsActive} />

          {SIDEBAR_NAV.map((section) => (
            <NavDropdown
              key={section.id}
              label={section.label}
              children={section.items}
              active={sectionIsActive(location.pathname, section)}
            />
          ))}

          <Link
            to="/backup"
            className={`app-topnav-link ${location.pathname === '/backup' ? 'is-active' : ''}`}
          >
            Backup
          </Link>
        </nav>

        <Link
          to="/user"
          className={`app-topnav-link app-topnav-link--trailing ${location.pathname === '/user' ? 'is-active' : ''}`}
        >
          User
        </Link>
      </div>
    </header>
  );
}
