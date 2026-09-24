import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cssPath = new URL('../apps/live/src/styles.css', import.meta.url);
const css = await readFile(cssPath, 'utf8');

const tinyCss = [...css.matchAll(/font-size\s*:\s*([0-9.]+)px/gi)]
  .map(match => ({ raw: match[0], value: Number(match[1]) }))
  .filter(item => Number.isFinite(item.value) && item.value < 12);

if (tinyCss.length) {
  console.error('UI contract failed: font-size below 12px remains in styles.css');
  for (const item of tinyCss.slice(0, 20)) console.error(`  ${item.raw}`);
  process.exit(1);
}

if (!css.includes('--live-touch-target:44px')) {
  console.error('UI contract failed: 44px touch target token is missing.');
  process.exit(1);
}

if (!/button,[\s\S]{0,240}min-height:var\(--live-touch-target\)!important/.test(css)) {
  console.error('UI contract failed: interactive controls do not enforce the 44px floor.');
  process.exit(1);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const srcRoot = fileURLToPath(new URL('../apps/live/src/', import.meta.url));
const sourceFiles = await walk(srcRoot);
const tinyInline = [];

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/fontSize\s*:\s*(\d+(?:\.\d+)?)/g)) {
    if (Number(match[1]) < 12) tinyInline.push({ file, raw: match[0] });
  }
}

if (tinyInline.length) {
  console.error('UI contract failed: inline fontSize below 12px detected.');
  for (const item of tinyInline.slice(0, 20)) {
    console.error(`  ${item.file}: ${item.raw}`);
  }
  process.exit(1);
}

console.log('MusicScale Live UI accessibility contract: OK');
