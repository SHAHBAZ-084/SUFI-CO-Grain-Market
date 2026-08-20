import { useEffect, useState } from 'react';
import { FieldLabel, PageShell, Panel, PrimaryButton, SecondaryButton, TextInput, Tile } from '../components/ui/PageShell';

const BACKUP_FOLDER_KEY = 'grain-pos-backup-folder';

function readStoredBackupFolder(): string {
  try {
    return localStorage.getItem(BACKUP_FOLDER_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeBackupFolder(folder: string): void {
  try {
    if (folder) {
      localStorage.setItem(BACKUP_FOLDER_KEY, folder);
    } else {
      localStorage.removeItem(BACKUP_FOLDER_KEY);
    }
  } catch {
    // Ignore storage errors (e.g. private browsing).
  }
}

export function BackupPage() {
  const [backupFolder, setBackupFolder] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const isDesktop = Boolean(window.grainPos?.pickBackupFolder && window.grainPos?.backupDatabase);

  useEffect(() => {
    setBackupFolder(readStoredBackupFolder());
  }, []);

  async function onChooseFolder() {
    if (!window.grainPos?.pickBackupFolder) {
      setError('Folder selection is only available in the desktop app.');
      return;
    }

    setPicking(true);
    setError('');
    setMessage('');

    try {
      const result = await window.grainPos.pickBackupFolder();
      if (result.ok && result.path) {
        setBackupFolder(result.path);
        storeBackupFolder(result.path);
        setMessage('Backup folder selected.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open folder picker.');
    } finally {
      setPicking(false);
    }
  }

  async function onBackupNow() {
    if (!backupFolder.trim()) {
      setError('Choose a backup folder first.');
      return;
    }

    if (!window.grainPos?.backupDatabase) {
      setError('Backup is only available in the desktop app.');
      return;
    }

    setBackingUp(true);
    setError('');
    setMessage('');

    try {
      const result = await window.grainPos.backupDatabase(backupFolder.trim());
      if (result.ok) {
        setMessage(`Backup saved to ${result.path}`);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <PageShell subtitle="Copy the current database to a folder on your computer">
      <Panel className="max-w-2xl">
        {!isDesktop ? (
          <Tile className="mb-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
            Run the Electron desktop app to choose a folder and create backups. Browser-only mode
            cannot access the file system.
          </Tile>
        ) : null}

        <div className="space-y-4">
          <div>
            <FieldLabel>Backup Location</FieldLabel>
            <TextInput
              readOnly
              value={backupFolder}
              placeholder="No folder selected"
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-textMuted">
              Backups are saved as timestamped files (e.g. sufi-co-backup-2026-08-20_14-30-00.db).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={onChooseFolder} disabled={picking || !isDesktop}>
              {picking ? 'Opening…' : 'Choose Folder'}
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={onBackupNow}
              disabled={!backupFolder.trim() || backingUp || !isDesktop}
            >
              {backingUp ? 'Backing up…' : 'Backup Now'}
            </PrimaryButton>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
        </div>
      </Panel>
    </PageShell>
  );
}
