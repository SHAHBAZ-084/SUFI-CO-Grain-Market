import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getPageTitle } from '../../config/navigation';

export function ContentHeader() {
  const location = useLocation();
  const { user } = useAuth();
  const title = getPageTitle(location.pathname);
  const isDashboard = location.pathname === '/';

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
      <div className="app-content-header-user">
        <span className="app-content-user-label">Logged in as</span>
        <Link to="/user" className="app-content-user-name">
          {user?.displayName ?? user?.username ?? 'User'}
        </Link>
      </div>
    </header>
  );
}
