/**
 * Bump the extension + npm version across package.json, package-lock.json, and src/manifest.json.
 *
 * Usage:
 *   node scripts/bump-version.mjs <semver>     e.g. 0.3.0
 *   node scripts/bump-version.mjs patch|minor|major
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER = /^\d+\.\d+\.\d+$/;
const CHROME_MAX = 65535;

function parseTriple(v) {
  const parts = v.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > CHROME_MAX)) {
    throw new Error(`Invalid version "${v}" (need major.minor.patch, each 0–${CHROME_MAX} for MV3)`);
  }
  return parts;
}

function formatTriple([major, minor, patch]) {
  return `${major}.${minor}.${patch}`;
}

function bumpFrom(current, kind) {
  const t = parseTriple(current);
  if (kind === 'major') return formatTriple([t[0] + 1, 0, 0]);
  if (kind === 'minor') return formatTriple([t[0], t[1] + 1, 0]);
  if (kind === 'patch') return formatTriple([t[0], t[1], t[2] + 1]);
  throw new Error(`Unknown bump kind "${kind}"`);
}

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const arg = process.argv[2];
if (!arg) {
  console.error(
    'Usage: node scripts/bump-version.mjs <semver|patch|minor|major>\n  Example: node scripts/bump-version.mjs 0.3.0\n  Example: node scripts/bump-version.mjs patch',
  );
  process.exit(1);
}

const pkgPath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');
const manifestPath = join(root, 'src', 'manifest.json');

const pkg = await readJson(pkgPath);
const current = pkg.version;
if (typeof current !== 'string' || !SEMVER.test(current)) {
  throw new Error(`package.json version "${current}" is not major.minor.patch`);
}

let next;
if (SEMVER.test(arg)) {
  parseTriple(arg);
  next = arg;
} else if (arg === 'patch' || arg === 'minor' || arg === 'major') {
  next = bumpFrom(current, arg);
} else {
  console.error(`Invalid argument "${arg}". Use semver (0.3.0) or patch|minor|major.`);
  process.exit(1);
}

if (next === current) {
  console.log(`Already at ${next}; no changes.`);
  process.exit(0);
}

pkg.version = next;
await writeJson(pkgPath, pkg);

const lock = await readJson(lockPath);
lock.version = next;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = next;
} else {
  throw new Error('package-lock.json missing packages[""] — regenerate with npm install');
}
await writeJson(lockPath, lock);

const manifest = await readJson(manifestPath);
manifest.version = next;
await writeJson(manifestPath, manifest);

console.log(`Version ${current} → ${next}`);
console.log('Updated: package.json, package-lock.json, src/manifest.json');
