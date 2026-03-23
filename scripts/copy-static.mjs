import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'dist'), { recursive: true });
await copyFile(join(root, 'src', 'manifest.json'), join(root, 'dist', 'manifest.json'));
await copyFile(join(root, 'src', 'options', 'options.html'), join(root, 'dist', 'options.html'));
await copyFile(join(root, 'src', 'content', 'content.css'), join(root, 'dist', 'content.css'));
await copyFile(join(root, 'src', 'options', 'options.css'), join(root, 'dist', 'options.css'));
