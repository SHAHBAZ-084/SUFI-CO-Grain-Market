import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface3">
      <TopBar />
      <main className="relative z-0">
        <Outlet />
      </main>
    </div>
  );
}
