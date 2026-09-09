/**
 * CLI entry for one-time legacy opening-balance import.
 * Prefer: npm run seed:legacy -w backend
 *
 * Packaged Electron also runs this automatically on first launch
 * (see backend/src/lib/startup.ts).
 */
import {
  runLegacyAccountImport,
} from '../src/lib/legacy-account-import';
import { prisma } from '../src/lib/prisma';

runLegacyAccountImport()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
