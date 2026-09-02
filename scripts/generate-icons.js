/**
 * Build Windows/desktop icons from the Sufi & Co logo.
 * Multi-resolution ICO (16–256px) is required for taskbar/desktop on Windows.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const pngToIco = (await import('png-to-ico')).default;
  const src = path.join(__dirname, '../frontend/public/sufi-co-logo.png');
  const buildDir = path.join(__dirname, '../build');
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  if (!fs.existsSync(src)) {
    console.error('Logo not found:', src);
    process.exit(1);
  }

  fs.mkdirSync(buildDir, { recursive: true });

  const masterPng = await sharp(src)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(buildDir, 'icon.png'), masterPng);

  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(masterPng)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .png()
        .toBuffer(),
    ),
  );

  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  console.log('[generate-icons] build/icon.png + build/icon.ico', `(${sizes.join(',')}px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
