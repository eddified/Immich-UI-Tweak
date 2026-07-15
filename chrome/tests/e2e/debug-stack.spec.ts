import { expect, test } from './fixtures';
import { demoOrigin, loginDemoImmich } from '../../../shared/e2e/demo-e2e-preset.ts';

const DEMO = demoOrigin();
const TARGET = '3604f14f-ab23-4aee-a6d5-92a15d8f5b2c';

test('debug stack icon stacking', async ({ context, extensionId }) => {
  const appPage = await context.newPage();
  await loginDemoImmich(appPage);
  await appPage.goto(`${DEMO}/photos`, { waitUntil: 'load', timeout: 60_000 });

  const thumb = appPage.locator(`[data-asset="${TARGET}"]`).first();
  await expect(thumb).toBeVisible({ timeout: 30_000 });

  // Scroll the date into view if needed.
  await thumb.scrollIntoViewIfNeeded();
  await appPage.waitForTimeout(500);

  const info = await thumb.evaluate((el) => {
    const thumbRect = el.getBoundingClientRect();
    const rows: any[] = [];
    el.querySelectorAll('div.absolute').forEach((row) => {
      const style = window.getComputedStyle(row);
      const children: any[] = [];
      Array.from(row.children).forEach((c) => {
        const cs = window.getComputedStyle(c);
        const r = c.getBoundingClientRect();
        children.push({
          tag: c.tagName,
          cls: c.className,
          dataset: Object.assign({}, (c as HTMLElement).dataset),
          position: cs.position,
          zIndex: cs.zIndex,
          left: r.left,
          right: r.right,
          top: r.top,
          width: r.width,
          height: r.height,
        });
      });
      rows.push({
        cls: row.className,
        dataset: Object.assign({}, (row as HTMLElement).dataset),
        position: style.position,
        zIndex: style.zIndex,
        left: row.getBoundingClientRect().left,
        right: row.getBoundingClientRect().right,
        top: row.getBoundingClientRect().top,
        children,
      });
    });
    return { thumbRect, rows };
  });

  console.log(JSON.stringify(info, null, 2));
});
