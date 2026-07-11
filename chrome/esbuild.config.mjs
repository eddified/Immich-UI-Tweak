import * as esbuild from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome114',
  logLevel: 'info',
};

await esbuild.build({
  ...common,
  entryPoints: {
    background: 'src/background.ts',
    content: 'src/content/content.ts',
    injected: 'src/content/injected.ts',
    options: 'src/options/options.ts',
  },
  outdir: 'dist',
});
