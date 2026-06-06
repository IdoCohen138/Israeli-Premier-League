import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconsDir = path.join(root, 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

async function main() {
  const sharp = (await import('sharp')).default;
  const svg = fs.readFileSync(svgPath);

  await sharp(svg).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'));
  await sharp(svg).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'));

  // Maskable: extra padding for Android adaptive icons
  await sharp(svg)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: { r: 12, g: 18, b: 33, alpha: 1 },
    })
    .png()
    .toFile(path.join(iconsDir, 'icon-512-maskable.png'));

  await sharp(svg).resize(180, 180).png().toFile(path.join(iconsDir, 'apple-touch-icon.png'));

  console.log('PWA icons generated in public/icons/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
