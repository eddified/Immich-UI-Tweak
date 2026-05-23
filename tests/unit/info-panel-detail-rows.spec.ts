/* @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { applyInfoPanelDetailRows, effectiveRowCollapsed } from '../../src/content/info-panel-detail-rows';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../src/shared/storage-types';

function s(partial: Partial<ExtensionSettings>): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}

const MDI_IMAGE_OUTLINE =
  'M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z';
const MDI_CAMERA =
  'M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z';
const MDI_CAMERA_IRIS =
  'M13.73,15L9.83,21.76C10.53,21.91 11.25,22 12,22C14.4,22 16.6,21.15 18.32,19.75L14.66,13.4M2.46,15C3.38,17.92 5.61,20.26 8.45,21.34L12.12,15M8.54,12L4.64,5.25C3,7 2,9.39 2,12C2,12.68 2.07,13.35 2.2,14H9.69M21.8,10H14.31L14.6,10.5L19.36,18.75C21,16.97 22,14.6 22,12C22,11.31 21.93,10.64 21.8,10M21.54,9C20.62,6.07 18.39,3.74 15.55,2.66L11.88,9M9.4,10.5L14.17,2.24C13.47,2.09 12.75,2 12,2C9.6,2 7.4,2.84 5.68,4.25L9.34,10.6L9.4,10.5Z';

function row(pathD: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'flex gap-4 py-4';
  el.innerHTML = `<div><svg><path d="${pathD}"></path></svg></div><div>Details</div>`;
  return el;
}

function detailPanelWithRows(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'detail-panel';
  const section = document.createElement('section');
  section.className = 'relative p-2';
  const block = document.createElement('div');
  block.className = 'px-4 py-4';
  block.append(row(MDI_IMAGE_OUTLINE), row(MDI_CAMERA), row(MDI_CAMERA_IRIS));
  section.append(block);
  panel.append(section);
  document.body.append(panel);
  return panel;
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

describe('applyInfoPanelDetailRows', () => {
  it('does not add z-index to open icon columns or collapsed-row toolbars', () => {
    document.body.replaceChildren();
    const panel = detailPanelWithRows();

    applyInfoPanelDetailRows(
      panel,
      s({
        infoPanelDetailRowFile: 'open',
        infoPanelDetailRowCamera: 'collapse',
        infoPanelDetailRowLens: 'collapse',
      }),
      {},
    );

    const fileIcon = panel.querySelector<HTMLElement>(
      '[data-immich-ui-tweak-detail-row="file"] > div:first-child',
    );
    expect(fileIcon?.style.zIndex).toBe('');

    const toolbar = panel.querySelector<HTMLElement>('[data-immich-ui-tweak-detail-rows-toolbar]');
    expect(toolbar).toBeTruthy();
    expect(toolbar?.style.zIndex).toBe('');
  });
});
