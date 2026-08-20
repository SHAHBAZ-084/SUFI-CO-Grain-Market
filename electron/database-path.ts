import fs from 'fs';
import path from 'path';
import { app } from 'electron';

function readDatabaseUrlFromEnv(backendRoot: string): string {
  const envPath = path.join(backendRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return 'file:./data/grain-pos.db';
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(?:"([^"]+)"|'([^']+)'|(\S+))/m);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? 'file:./data/grain-pos.db';
}

/** Resolve the on-disk SQLite file (mirrors backend/src/lib/database-path.ts). */
export function getDatabaseFilePath(): string {
  const backendRoot = path.join(app.getAppPath(), 'backend');
  const url = readDatabaseUrlFromEnv(backendRoot);
  const raw = url.replace(/^file:/, '');

  if (path.isAbsolute(raw)) {
    return raw;
  }

  return path.resolve(backendRoot, raw);
}

export function formatBackupFilename(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
  const time = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
  return `sufi-co-backup-${stamp}_${time}.db`;
}
