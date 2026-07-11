import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.join(projectRoot, '..');

/** Same browser path for install, test, and dev-browser (avoids mismatched PLAYWRIGHT_BROWSERS_PATH). */
export function configurePlaywrightEnv() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(repoRoot, '.playwright-browsers');

  // Playwright 1.60 has no ubuntu26.04-x64 manifest entry; 24.04 binaries run on 26.04.
  if (process.platform === 'linux' && !process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) {
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
      if (/VERSION_ID="26\.04"/.test(osRelease)) {
        process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = 'ubuntu24.04-x64';
      }
    } catch {
      /* ignore */
    }
  }
}
