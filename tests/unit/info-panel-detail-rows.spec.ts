import { describe, expect, it } from 'vitest';
import { effectiveRowCollapsed } from '../../src/content/info-panel-detail-rows';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../src/shared/storage-types';

function s(partial: Partial<ExtensionSettings>): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}

describe('effectiveRowCollapsed', () => {
  it('uses explicit value when set (open / collapse modes)', () => {
    const settings = s({ infoPanelDetailRowFile: 'open' });
    expect(effectiveRowCollapsed('file', settings, { file: true })).toBe(true);
    expect(effectiveRowCollapsed('file', settings, { file: false })).toBe(false);
  });

  it('falls back to mode when explicit omitted', () => {
    expect(effectiveRowCollapsed('camera', s({ infoPanelDetailRowCamera: 'collapse' }), {})).toBe(true);
    expect(effectiveRowCollapsed('lens', s({ infoPanelDetailRowLens: 'open' }), {})).toBe(false);
  });

  it('hide mode is never collapsed in this sense (row is not shown)', () => {
    expect(effectiveRowCollapsed('file', s({ infoPanelDetailRowFile: 'hide' }), { file: true })).toBe(false);
  });
});
