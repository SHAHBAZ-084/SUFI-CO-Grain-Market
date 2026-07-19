import { PageShell, Panel } from '../../components/ui/PageShell';

export function SystemPreferencesPage() {
  return (
    <PageShell title="System Preference" subtitle="Shop-wide settings">
      <Panel>
        <p className="text-sm text-stone-600">Preference fields (shop name, default units, print layout) will go here.</p>
      </Panel>
    </PageShell>
  );
}
