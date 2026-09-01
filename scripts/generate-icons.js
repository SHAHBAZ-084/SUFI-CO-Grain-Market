/**
 * Build Windows/desktop icons from the Sufi & Co logo.
 * Output: build/icon.png + build/icon.ico (multi-size for taskbar/desktop/.exe)
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const src = path.join(__dirname, '../frontend/public/sufi-co-logo.png');
  const buildDir = path.join(__dirname, '../build');

  if (!fs.existsSync(src)) {
    console.error('Logo not found:', src);
    process.exit(1);
  }

  fs.mkdirSync(buildDir, { recursive: true });
  fs.copyFileSync(src, path.join(buildDir, 'icon.png'));

  const pngToIco = (await import('png-to-ico')).default;
  const ico = await pngToIco(src);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  console.log('[generate-icons] build/icon.png + build/icon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
