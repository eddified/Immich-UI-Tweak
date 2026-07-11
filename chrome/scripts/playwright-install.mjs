import { spawnSync } from 'node:child_process';
import { configurePlaywrightEnv } from './configure-playwright-env.mjs';

configurePlaywrightEnv();

const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
