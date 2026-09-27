import { readFile } from 'node:fs/promises';

const path = new URL('../docs/certification/production-certification.json', import.meta.url);
const manifest = JSON.parse(await readFile(path, 'utf8'));

const requiredEvidence = [
  'windowsIpad',
  'windowsAndroid',
  'holyricsResolumeTwoPc',
  'propresenterOnly',
  'internetCutLanContinuity',
  'nodeRestartNoReplay',
  'providerFailureIsolation',
  'commandObservedP95',
  'threeSimulatedServices',
  'accompaniedRealService',
  'volunteerUx',
  'realDeviceAccessibility',
  'windowsSignedInstallerTrust',
  'macosSignedNotarizedTrust',
  'branchProtection'
];

const expectedVersion = '0.1.0-beta.2';
const errors = [];

if (manifest?.schemaVersion !== 1) {
  errors.push('schemaVersion must be 1');
}
if (manifest?.candidateVersion !== expectedVersion) {
  errors.push(`candidateVersion must be ${expectedVersion}`);
}
if (manifest?.status !== 'approved') {
  errors.push('status must be approved');
}
if (typeof manifest?.approvedBy !== 'string' || !manifest.approvedBy.trim()) {
  errors.push('approvedBy is required');
}
if (
  typeof manifest?.approvedAt !== 'string' ||
  Number.isNaN(Date.parse(manifest.approvedAt))
) {
  errors.push('approvedAt must be an ISO date/time');
}

for (const key of requiredEvidence) {
  const item = manifest?.evidence?.[key];
  if (
    !item ||
    typeof item !== 'object' ||
    item.result !== 'PASS' ||
    typeof item.ref !== 'string' ||
    !item.ref.trim()
  ) {
    errors.push(`evidence.${key} must contain { "result": "PASS", "ref": "..." }`);
  }
}

if (errors.length) {
  console.error('MusicScale Live production certification gate is CLOSED:');
  for (const error of errors) console.error(`- ${error}`);
  console.error(
    'Attach real physical/signing/admin evidence before promoting this candidate.'
  );
  process.exit(1);
}

console.log(
  `MusicScale Live production certification gate: ${manifest.candidateVersion} APPROVED`
);
