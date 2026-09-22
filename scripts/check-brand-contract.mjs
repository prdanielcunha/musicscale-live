import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.firebase']);
const TEXT_EXTENSIONS = new Set([
  '.md', '.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml',
  '.ps1', '.cmd', '.command', '.iss', '.html', '.css'
]);

const LEGACY_PATTERNS = [
  'MillionsNest Live',
  'MillionsNestLive',
  'millionsnest-live',
  'MILLIONSNEST / LIVE'
];

const LEGACY_COMPATIBILITY_ALLOWLIST = new Set([
  'apps/live/src/credentialStore.ts',
  'apps/live/src/liveNodeClient.ts',
  'distribution/macos/install.command',
  'distribution/macos/uninstall.command',
  'distribution/windows/MusicScaleLiveNode.iss',
  'distribution/windows/install.ps1',
  'distribution/windows/uninstall.ps1',
  'packages/domain/src/transport.ts',
  'packages/live-node/src/index.ts',
  'packages/live-node/src/peerDiscovery.ts',
  'packages/live-node/src/peerFederation.ts',
  'packages/live-node/test/peerDiscovery.test.ts',
  'packages/live-node/test/peerFederation.test.ts',
  'scripts/check-brand-contract.mjs'
]);

const CANONICAL_FILES = new Map([
  ['README.md', 'MusicScale Live'],
  ['apps/live/index.html', 'MusicScale Live'],
  ['apps/live/vite.config.ts', 'MusicScale Live'],
  ['distribution/README-INSTALL.md', 'MusicScale Live'],
  ['docs/BRAND-CONTRACT.md', 'MusicScale Live']
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') {
      if (entry.isDirectory()) continue;
    }
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await walk(join(dir, entry.name)));
      continue;
    }
    if (!TEXT_EXTENSIONS.has(extname(entry.name)) && entry.name !== '.firebaserc') continue;
    files.push(join(dir, entry.name));
  }
  return files;
}

const failures = [];
for (const file of await walk(ROOT)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const content = await readFile(file, 'utf8');
  if (!LEGACY_COMPATIBILITY_ALLOWLIST.has(rel)) {
    for (const pattern of LEGACY_PATTERNS) {
      if (content.includes(pattern)) {
        failures.push(`${rel}: legacy product identifier "${pattern}" is outside the compatibility allowlist`);
      }
    }
  }
}

for (const [file, required] of CANONICAL_FILES) {
  const content = await readFile(join(ROOT, file), 'utf8');
  if (!content.includes(required)) {
    failures.push(`${file}: canonical brand "${required}" is missing`);
  }
}

if (failures.length) {
  console.error('MusicScale Live brand contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('MusicScale Live brand contract: OK');
