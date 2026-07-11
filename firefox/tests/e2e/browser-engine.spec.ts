import { expect, test } from './fixtures';

test.describe('Playwright browser engine', () => {
  test('e2e suite uses Firefox (not Chromium)', async ({ browserWithExtension }) => {
    expect(browserWithExtension.browserType().name()).toBe('firefox');
    // Playwright reports the engine version only (e.g. "150.0.2"), not a "Firefox …" user-agent string.
    expect(browserWithExtension.version()).toMatch(/^\d+\./);
  });
});
