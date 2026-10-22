/* eslint-disable no-console -- a CLI script reports on stdout */
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the icon set from the logo SVG (docs/design/README.md, "Brand identity"):
 *   node scripts/make-icons.mjs [source.svg]
 * Default source: public/icons/rally-logo.svg (the Buddy Club mark on its lime tile).
 * Writes, for both product keys (`rally` is the live app, `buddyclub` the parked one):
 *   <key>.svg            the source, labelled, for the favicon
 *   <key>-192.png, <key>-512.png, <key>-apple.png (180)
 *   <key>-maskable-512.png   tile colour to the edge, mark in the 80% safe zone
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const iconsDir = join(here, '..', 'public', 'icons');
const source = process.argv[2] ? resolve(process.argv[2]) : join(iconsDir, 'rally-logo.svg');
const TILE = '#e6fe6f';

function loadSharp() {
  const require = createRequire(import.meta.url);
  try {
    return require('sharp');
  } catch {
    const store = join(root, 'node_modules', '.pnpm');
    const dir = readdirSync(store).find((d) => d.startsWith('sharp@'));
    if (!dir) throw new Error('sharp is not installed anywhere in the workspace');
    return require(join(store, dir, 'node_modules', 'sharp'));
  }
}

const sharp = loadSharp();
const svg = readFileSync(source, 'utf8');
const labelled = svg.replace('<svg ', '<svg role="img" aria-label="Buddy Club" ');
mkdirSync(iconsDir, { recursive: true });

async function build(key) {
  writeFileSync(join(iconsDir, `${key}.svg`), labelled);
  for (const [name, size] of [
    ['192', 192],
    ['512', 512],
    ['apple', 180],
  ]) {
    await sharp(Buffer.from(svg), { density: 384 })
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, `${key}-${name}.png`));
  }
  // Maskable: the platform crops a circle or squircle, so the mark sits in the central 80%.
  const inner = Math.round(512 * 0.8);
  const mark = await sharp(Buffer.from(svg), { density: 384 })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: TILE } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(join(iconsDir, `${key}-maskable-512.png`));
  console.log(`${key}: svg, 192, 512, apple, maskable`);
}

for (const key of ['rally', 'buddyclub']) await build(key);
console.log(`from ${source}`);
