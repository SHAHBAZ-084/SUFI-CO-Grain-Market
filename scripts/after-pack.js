/**
 * electron-builder afterPack: Prisma unpack + Windows .exe icon.
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.endsWith('.tmp') || entry.name.includes('.tmp')) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Embed build/icon.ico into the packaged .exe (required when signAndEditExecutable is false). */
async function applyWindowsExeIcon(appOutDir, projectDir, productFilename) {
  const iconPath = path.resolve(projectDir, 'build', 'icon.ico');
  const exePath = path.resolve(appOutDir, `${productFilename}.exe`);
  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] skip exe icon — missing', iconPath);
    return;
  }
  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] skip exe icon — missing', exePath);
    return;
  }

  const rcedit = require('rcedit');
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: 'Sufi & Co',
      FileDescription: 'Sufi & Co',
      CompanyName: 'Sufi & Co',
      InternalName: 'GrainMarketPOS',
      OriginalFilename: 'Sufi & Co.exe',
    },
  });
  console.log('[afterPack] applied Sufi & Co icon to', exePath);
}

exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const resourcesDir = path.join(context.appOutDir, 'resources');
  const source = path.join(projectDir, 'node_modules', '.prisma');

  if (!fs.existsSync(source)) {
    console.warn('[afterPack] node_modules/.prisma missing — run prisma generate');
  } else {
    const targets = [
      path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', '.prisma'),
      path.join(resourcesDir, 'node_modules', '.prisma'),
      path.join(resourcesDir, 'backend', 'node_modules', '.prisma'),
    ];

    for (const dest of targets) {
      copyDir(source, dest);
      console.log('[afterPack] copied .prisma →', dest);
    }
  }

  if (context.electronPlatformName === 'win32') {
    await applyWindowsExeIcon(
      context.appOutDir,
      projectDir,
      context.packager.appInfo.productFilename,
    );
  }
};
