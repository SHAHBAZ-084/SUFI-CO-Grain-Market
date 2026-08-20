import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { formatBackupFilename, getDatabaseFilePath } from './database-path';

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = process.env.PORT ?? '3847';
const APP_ICON = path.join(__dirname, '../build/icon.png');

let mainWindow: BrowserWindow | null = null;

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:pick-backup-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Choose backup folder',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Choose backup folder',
          properties: ['openDirectory', 'createDirectory'],
        });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, path: null };
    }

    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('db:backup', async (_event, destFolder: unknown) => {
    if (typeof destFolder !== 'string' || !destFolder.trim()) {
      return { ok: false, error: 'No backup folder selected.' };
    }

    const folder = destFolder.trim();

    try {
      const stat = await fs.promises.stat(folder).catch(() => null);
      if (!stat?.isDirectory()) {
        return { ok: false, error: 'Backup folder does not exist or is not accessible.' };
      }

      const dbPath = getDatabaseFilePath();
      if (!fs.existsSync(dbPath)) {
        return {
          ok: false,
          error: 'Database file not found. Use the app at least once before backing up.',
        };
      }

      const filename = formatBackupFilename(new Date());
      const destPath = path.join(folder, filename);
      await fs.promises.copyFile(dbPath, destPath);

      return { ok: true, path: destPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup failed';
      return { ok: false, error: message };
    }
  });
}

async function startBackend(): Promise<void> {
  if (isDev) {
    return;
  }

  process.env.PORT = BACKEND_PORT;
  process.env.NODE_ENV = 'production';

  const backendEntry = path.join(__dirname, '../backend/dist/index.js');
  await import(backendEntry);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Grain Market POS',
    icon: APP_ICON,
    show: false,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the renderer (and Vite HMR websocket) alive while minimized on Windows.
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setBackgroundThrottling(false);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Window failed to load:', errorCode, errorDescription);
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    if (process.env.ELECTRON_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function showStartupError(message: string): Promise<void> {
  await dialog.showMessageBox({
    type: 'error',
    title: 'Grain Market POS — Startup failed',
    message: 'The application could not start safely.',
    detail: message,
  });
  app.quit();
}

function configureAutoUpdater(): void {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const options = {
      type: 'info' as const,
      title: 'Update ready',
      message: 'A new version has been downloaded.',
      detail: 'Restart the app to apply the update.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    };
    const promise = win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
    promise.then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err: Error) => {
    console.warn('Auto-update check failed:', err.message);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    console.warn('Could not check for updates:', err instanceof Error ? err.message : err);
  });
}

app.whenReady().then(async () => {
  try {
    registerIpcHandlers();
    await startBackend();

    if (!isDev) {
      const health = await waitForBackendHealth();
      if (!health.ok) {
        const detail =
          health.database?.error ??
          (health.database && !health.database.integrityOk
            ? 'Database integrity check failed.'
            : 'Backend health check failed.');
        await showStartupError(detail);
        return;
      }
    }

    createWindow();
    configureAutoUpdater();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await showStartupError(message);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

type HealthResponse = {
  ok: boolean;
  database?: {
    exists: boolean;
    migrationsApplied: boolean;
    integrityOk: boolean;
    error: string | null;
  };
};

async function waitForBackendHealth(maxAttempts = 40): Promise<HealthResponse> {
  const url = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return (await response.json()) as HealthResponse;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Backend failed to start');
}
