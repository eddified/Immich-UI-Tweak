// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installSlashFocusSearch,
  isPlainSlashKey,
  shouldPassSlashThrough,
} from '../../src/content/slash-focus-search';
import { DEFAULT_SETTINGS } from '../../src/shared/storage-types';

describe('remapSlashToFocusSearch default', () => {
  it('is enabled in DEFAULT_SETTINGS so existing installs keep current behavior', () => {
    expect(DEFAULT_SETTINGS.remapSlashToFocusSearch).toBe(true);
  });
});

function slashKeyEvent(init?: Partial<KeyboardEventInit>): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: '/',
    code: 'Slash',
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

describe('isPlainSlashKey', () => {
  it('is true for plain / via key', () => {
    expect(isPlainSlashKey(slashKeyEvent({ code: undefined }))).toBe(true);
  });

  it('is true for Slash via code when key differs', () => {
    expect(isPlainSlashKey(slashKeyEvent({ key: 'Divide', code: 'Slash' }))).toBe(true);
  });

  it('is false when Ctrl is held', () => {
    expect(isPlainSlashKey(slashKeyEvent({ ctrlKey: true }))).toBe(false);
  });

  it('is false when Meta is held', () => {
    expect(isPlainSlashKey(slashKeyEvent({ metaKey: true }))).toBe(false);
  });

  it('is false when Alt is held', () => {
    expect(isPlainSlashKey(slashKeyEvent({ altKey: true }))).toBe(false);
  });

  it('is false for unrelated keys', () => {
    expect(isPlainSlashKey(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))).toBe(false);
  });
});

describe('shouldPassSlashThrough', () => {
  it('is false for null', () => {
    expect(shouldPassSlashThrough(null)).toBe(false);
  });

  it('is false for body (non-field)', () => {
    expect(shouldPassSlashThrough(document.body)).toBe(false);
  });

  it('is true for textarea', () => {
    const ta = document.createElement('textarea');
    expect(shouldPassSlashThrough(ta)).toBe(true);
  });

  it('is true for select', () => {
    const sel = document.createElement('select');
    expect(shouldPassSlashThrough(sel)).toBe(true);
  });

  it('is true for contenteditable', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    expect(shouldPassSlashThrough(div)).toBe(true);
  });

  it('is true for text-like input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    expect(shouldPassSlashThrough(input)).toBe(true);
  });

  it('is true for main search bar id regardless of type text', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'main-search-bar';
    expect(shouldPassSlashThrough(input)).toBe(true);
  });

  it('is false for checkbox', () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    expect(shouldPassSlashThrough(input)).toBe(false);
  });

  it('is false for button', () => {
    expect(shouldPassSlashThrough(document.createElement('button'))).toBe(false);
  });
});

describe('installSlashFocusSearch', () => {
  let uninstall: (() => void) | undefined;

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
  });

  it('focuses #main-search-bar and prevents default when extension is active', () => {
    const input = document.createElement('input');
    input.id = 'main-search-bar';
    input.type = 'text';
    document.body.append(input);
    /* happy-dom often treats the navbar search as not visible; Immich always shows it on desktop. */
    Object.assign(input, {
      checkVisibility: () => true,
    });

    const focusSpy = vi.spyOn(input, 'focus');
    uninstall = installSlashFocusSearch(() => true);

    const ev = slashKeyEvent();
    const preventSpy = vi.spyOn(ev, 'preventDefault');
    const stopSpy = vi.spyOn(ev, 'stopImmediatePropagation');

    document.dispatchEvent(ev);

    expect(focusSpy).toHaveBeenCalledOnce();
    expect(preventSpy).toHaveBeenCalledOnce();
    expect(stopSpy).toHaveBeenCalledOnce();
  });

  it('does not intercept when extension is inactive', () => {
    const input = document.createElement('input');
    input.id = 'main-search-bar';
    input.type = 'text';
    document.body.append(input);

    uninstall = installSlashFocusSearch(() => false);

    const ev = slashKeyEvent();
    const preventSpy = vi.spyOn(ev, 'preventDefault');

    document.dispatchEvent(ev);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('does not prevent default when focus is in a textarea', () => {
    const input = document.createElement('input');
    input.id = 'main-search-bar';
    input.type = 'text';
    const ta = document.createElement('textarea');
    document.body.append(input, ta);
    ta.focus();

    uninstall = installSlashFocusSearch(() => true);

    const ev = slashKeyEvent();
    const preventSpy = vi.spyOn(ev, 'preventDefault');

    document.dispatchEvent(ev);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('ignores key repeat', () => {
    const input = document.createElement('input');
    input.id = 'main-search-bar';
    input.type = 'text';
    document.body.append(input);

    uninstall = installSlashFocusSearch(() => true);

    const ev = slashKeyEvent();
    Object.defineProperty(ev, 'repeat', { value: true, configurable: true });
    const preventSpy = vi.spyOn(ev, 'preventDefault');

    document.dispatchEvent(ev);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('clicks #search-button when main search is not usable', () => {
    const input = document.createElement('input');
    input.id = 'main-search-bar';
    input.type = 'text';
    input.style.display = 'none';
    document.body.append(input);

    const btn = document.createElement('button');
    btn.id = 'search-button';
    btn.type = 'button';
    document.body.append(btn);

    const clickSpy = vi.spyOn(btn, 'click');

    uninstall = installSlashFocusSearch(() => true);

    const ev = slashKeyEvent();
    document.dispatchEvent(ev);

    expect(clickSpy).toHaveBeenCalledOnce();
  });
});
