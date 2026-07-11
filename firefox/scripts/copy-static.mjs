import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'dist'), { recursive: true });
const iconsDir = join(root, 'src', 'icons');
const distIcons = join(root, 'dist', 'icons');
await mkdir(distIcons, { recursive: true });
let iconFiles = [];
try {
  iconFiles = await readdir(iconsDir);
} catch {
  /* run npm run icons:render */
}
for (const name of iconFiles) {
  if (name.endsWith('.png')) {
    await copyFile(join(iconsDir, name), join(distIcons, name));
  }
}

const contentAssetsDir = join(root, 'src', 'content', 'assets');
const distContentAssets = join(root, 'dist', 'assets');
await mkdir(distContentAssets, { recursive: true });
let contentAssetFiles = [];
try {
  contentAssetFiles = await readdir(contentAssetsDir);
} catch {
  /* run npm run icons:google-maps */
}
for (const name of contentAssetFiles) {
  if (name.endsWith('.png')) {
    await copyFile(join(contentAssetsDir, name), join(distContentAssets, name));
  }
}

const manifest = JSON.parse(await readFile(join(root, 'src', 'manifest.json'), 'utf8'));
// Playwright's Firefox rejects MV3 service workers for temporary add-ons; real Firefox installs use the service worker.
if (process.env.PLAYWRIGHT_BUILD === '1') {
  manifest.background = { scripts: ['background.js'] };
  manifest.host_permissions = manifest.optional_host_permissions ?? [];
  delete manifest.optional_host_permissions;
}
await writeFile(join(root, 'dist', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await copyFile(join(root, 'src', 'options', 'options.html'), join(root, 'dist', 'options.html'));
await copyFile(join(root, 'src', 'content', 'content.css'), join(root, 'dist', 'content.css'));
await copyFile(join(root, 'src', 'options', 'options.css'), join(root, 'dist', 'options.css'));
