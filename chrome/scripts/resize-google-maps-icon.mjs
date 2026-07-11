/**
 * Writes `src/content/assets/google-maps-icon-2026-48w.png` (48×48, RGBA).
 *
 * 1. Load the Wikimedia 1280px PNG (default: fetch the URL below).
 * 2. Resize with sharp only (Lanczos3, proportional fit, transparent padding).
 *
 * Local file: `GOOGLE_MAPS_SOURCE_PNG=/path/to.png` or `node ... --from /path/to.png`
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUTPUT_SIZE = 48;

const COMMONS_1280_PNG_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Google_Maps_icon_%282026%29.svg/1280px-Google_Maps_icon_%282026%29.svg.png';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function resizeSourceToPng48(input) {
  return sharp(input)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

function parseFromArg(argv) {
  const i = argv.indexOf('--from');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return process.env.GOOGLE_MAPS_SOURCE_PNG;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src/content/assets/google-maps-icon-2026-48w.png');
const fromPath = parseFromArg(process.argv);

await mkdir(dirname(outPath), { recursive: true });

let sourceBytes;
if (fromPath) {
  sourceBytes = await readFile(fromPath);
} else {
  const res = await fetch(COMMONS_1280_PNG_URL, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(
      `Failed to download PNG (${res.status} ${res.statusText}). Save the file from:\n  ${COMMONS_1280_PNG_URL}\nthen run:\n  node scripts/resize-google-maps-icon.mjs --from /path/to/saved.png`,
    );
  }
  sourceBytes = Buffer.from(await res.arrayBuffer());
}

const png = await resizeSourceToPng48(sourceBytes);
await writeFile(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
