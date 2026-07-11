import { copyFile, mkdir, readdir } from 'node:fs/promises';
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

await copyFile(join(root, 'src', 'manifest.json'), join(root, 'dist', 'manifest.json'));
await copyFile(join(root, 'src', 'options', 'options.html'), join(root, 'dist', 'options.html'));
await copyFile(join(root, 'src', 'content', 'content.css'), join(root, 'dist', 'content.css'));
await copyFile(join(root, 'src', 'options', 'options.css'), join(root, 'dist', 'options.css'));
