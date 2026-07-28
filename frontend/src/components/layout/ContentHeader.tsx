import { Link, useLocation } from 'react-router-dom';
import { getPageTitle } from '../../config/navigation';

/** Invoice forms render their own centered PageShell title (same pattern as vouchers). */
function isInvoiceFormPath(pathname: string) {
  return (
    pathname.startsWith('/invoices/sale-commission')
    || pathname.startsWith('/invoices/sale-paunch')
    || pathname.startsWith('/invoices/purchase-maal')
    || pathname.startsWith('/invoices/kachi-maal')
  );
}

export function ContentHeader() {
  const location = useLocation();
  const title = getPageTitle(location.pathname);
  const isDashboard = location.pathname === '/';

  if (isInvoiceFormPath(location.pathname)) {
    return null;
  }

  return (
    <header className="app-content-header">
      <div className="app-content-header-main">
        {!isDashboard ? (
          <p className="app-breadcrumb">
            <Link to="/" className="app-breadcrumb-link">
              Home
            </Link>
            <span className="app-breadcrumb-sep">/</span>
            <span>{title}</span>
          </p>
        ) : null}
        <h1 className="app-content-title">{title}</h1>
      </div>
    </header>
  );
}
