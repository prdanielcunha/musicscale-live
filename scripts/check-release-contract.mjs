import { readFile } from 'node:fs/promises';

const expected = '0.1.0-beta.1';
const [nodeIndex, inno, packagesWorkflow] = await Promise.all([
  readFile(new URL('../packages/live-node/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../distribution/windows/MusicScaleLiveNode.iss', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/node-packages.yml', import.meta.url), 'utf8')
]);

const checks = [
  {
    name: 'Live Node runtime',
    ok: nodeIndex.includes(`const VERSION = '${expected}';`)
  },
  {
    name: 'Windows installer default',
    ok: inno.includes(`#define AppVersion "${expected}"`)
  },
  {
    name: 'package workflow',
    ok: packagesWorkflow.includes(`LIVE_NODE_VERSION: ${expected}`)
  }
];

const failed = checks.filter(check => !check.ok);
if (failed.length) {
  console.error(`Release contract mismatch. Expected ${expected} everywhere:`);
  for (const item of failed) console.error(`- ${item.name}`);
  process.exit(1);
}

console.log(`MusicScale Live release contract: ${expected} OK`);
