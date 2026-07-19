import { useAuth } from '../../contexts/AuthContext';
import { PageShell, Panel, SecondaryButton } from '../../components/ui/PageShell';

export function UserInfoPage() {
  const { user, logout } = useAuth();

  return (
    <PageShell title="User" subtitle="Logged-in account details">
      <Panel className="max-w-md space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Display name</p>
          <p className="text-lg font-medium text-stone-900">{user?.displayName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Username</p>
          <p className="text-stone-800">{user?.username}</p>
        </div>
        <SecondaryButton onClick={() => logout()}>Sign out</SecondaryButton>
      </Panel>
    </PageShell>
  );
}
