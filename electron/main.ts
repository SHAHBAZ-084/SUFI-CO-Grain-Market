import { app, BrowserWindow } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = process.env.PORT ?? '3847';

let mainWindow: BrowserWindow | null = null;

async function startBackend(): Promise<void> {
  if (isDev) {
    // Backend runs as a separate dev process via concurrently.
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startBackend();

  if (!isDev) {
    await waitForBackend();
  }

  createWindow();

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

async function waitForBackend(maxAttempts = 30): Promise<void> {
  const url = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Backend failed to start');
}
