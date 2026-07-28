import { Outlet } from 'react-router-dom';
import { ContentHeader } from './ContentHeader';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <ContentHeader />
        <main className="app-main-scroll">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
