import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';

export function AppShell() {
  return (
    <div className="min-h-screen bg-stone-100">
      <TopBar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
