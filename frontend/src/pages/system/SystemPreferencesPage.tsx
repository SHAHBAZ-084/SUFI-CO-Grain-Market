import { PageShell, Panel, Tile } from '../../components/ui/PageShell';
import { useTheme } from '../../contexts/ThemeContext';

export function SystemPreferencesPage() {
  const { theme, setTheme } = useTheme();

  return (
    <PageShell title="System Preference" subtitle="Shop-wide settings">
      <Panel className="max-w-lg">
        <Tile>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-textPrimary">Appearance</p>
              <p className="mt-1 text-xs text-textMuted">Choose light or dark theme for the whole app.</p>
            </div>
            <div className="flex rounded-lg border border-border bg-surface2 p-1">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  theme === 'light'
                    ? 'bg-accent text-onAccent'
                    : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  theme === 'dark'
                    ? 'bg-accent text-onAccent'
                    : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                Dark
              </button>
            </div>
          </div>
        </Tile>

        <p className="mt-4 text-sm text-textSecondary">
          More preference fields (shop name, default units, print layout) will be added here.
        </p>
      </Panel>
    </PageShell>
  );
}
