/**
 * Rasterize design/extension-icon-immich-logo-pencil.svg to PNG sizes used by Chrome MV3.
 *
 * Inlines the SVG in HTML — Chromium blocks file:// URLs on <img> inside about:blank,
 * which previously produced broken-image placeholders.
 *
 * PNGs use alpha (transparent pixels outside the artwork) via omitBackground.
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'design', 'extension-icon-immich-logo-pencil.svg');
const outDir = join(root, 'src', 'icons');
const sizes = [16, 32, 48, 128];

let svgTemplate = await readFile(svgPath, 'utf8');
svgTemplate = svgTemplate.replace(/<\?xml[^?]*\?>\s*/i, '');
/* Drop HTML/XML comments so they cannot confuse the parser */
svgTemplate = svgTemplate.replace(/<!--[\s\S]*?-->/g, '');

function svgForSize(size) {
  return svgTemplate.replace(
    /<svg\b([^>]*)>/i,
    (_, attrs) => {
      const noDim = attrs
        .replace(/\s+width="[^"]*"/gi, '')
        .replace(/\s+height="[^"]*"/gi, '');
      return `<svg${noDim} width="${size}" height="${size}" style="display:block">`;
    },
  );
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const size of sizes) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:transparent;overflow:hidden;width:${size}px;height:${size}px">
${svgForSize(size)}
</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.locator('svg').waitFor({ state: 'visible' });
    await page.screenshot({
      path: join(outDir, `icon-${size}.png`),
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`Wrote ${sizes.map((s) => `icon-${s}.png`).join(', ')} → ${outDir}`);
