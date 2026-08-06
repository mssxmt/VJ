// Supply-chain IoC scanner for package-lock.json.
//
// Why-not: inline `node -e` in the workflow is unreadable for a curated IoC
// list, and a standalone file lets us run the same check locally
// (`npm run scan:supply-chain`) so a developer can vet a lockfile *before*
// `npm install` ever executes a malicious lifecycle script.
//
// IoC source: Aikido blog — "keyv and friends compromised in npm supply
// chain attack" (Shai-Hulud worm). Update MALICIOUS_VERSIONS and IOC_PATTERNS
// when new indicators are published.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lockPath = resolve(__dirname, '..', '..', 'package-lock.json');

// Known-malicious package@version pairs from the Shai-Hulud attack.
const MALICIOUS_VERSIONS = {
  // ── Hijacked cache-family packages (direct) ──
  keyv: ['6.0.0'],
  'flat-cache': ['6.1.24'],
  'file-entry-cache': ['11.1.6'],
  'cacheable-request': ['13.0.20'],
  cacheable: ['2.5.1'],
  '@cacheable/memory': ['2.2.1'],
  'cache-manager': ['7.2.10'],
  '@cacheable/node-cache': ['3.1.2'],
  '@cacheable/utils': ['2.5.1'],
  '@cacheable/net': ['2.1.1'],
  ecto: ['5.0.1'],
  // ── Worm-propagated community packages ──
  '@deliveroo/reevent': ['1.0.1'],
  '@or-sdk/invitations': ['1.4.9'],
  '@picsart/ai-sdk': ['3.32.2'],
  '@qlik/embed-runtime': ['1.6.4'],
  'picasso.js': ['2.11.6'],
};

// Substrings whose mere presence in the lockfile is suspicious.
const IOC_PATTERNS = [
  'npm-cache.com', // attacker-controlled exfiltration endpoint
];

const raw = readFileSync(lockPath, 'utf8');
const lock = JSON.parse(raw);
const packages = lock.packages ?? {};
const hits = [];

for (const [depPath, meta] of Object.entries(packages)) {
  if (depPath === '') continue; // project root, not a dependency

  // Extract the name from the final node_modules/ segment so nested deps
  // (node_modules/parent/node_modules/keyv) resolve to "keyv", not
  // "parent/node_modules/keyv" — otherwise nested malicious copies slip past.
  const name = depPath.split('node_modules/').pop();

  const bad = MALICIOUS_VERSIONS[name];
  if (bad?.includes(meta.version)) {
    hits.push(`MALICIOUS VERSION  ${name}@${meta.version}  (${depPath})`);
  }

  // Every resolved tarball must come from the official registry.
  if (
    meta.resolved &&
    !meta.resolved.startsWith('https://registry.npmjs.org/')
  ) {
    hits.push(`SUSPICIOUS URL     ${name} resolves to ${meta.resolved}`);
  }
}

for (const pattern of IOC_PATTERNS) {
  if (raw.includes(pattern)) {
    hits.push(`IOC STRING         "${pattern}" found in package-lock.json`);
  }
}

const total = Object.keys(packages).length - 1; // exclude root

if (hits.length) {
  console.error('\n\u{1F6A8} Supply-chain check FAILED \u{1F6A8}\n');
  for (const h of hits) console.error('  ' + h);
  console.error(
    '\nDo NOT install. Investigate immediately — this matches indicators',
  );
  console.error('of the Shai-Hulud npm supply-chain compromise.\n');
  process.exit(1);
}

console.log(
  `✅ Supply-chain check passed — ${total} packages scanned, 0 IoC hits.`,
);
