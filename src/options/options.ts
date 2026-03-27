import { filterCompleteMappings, normalizePathMappingRow } from '../shared/path-mapping';
import {
  DEFAULT_SETTINGS,
  MAX_ENABLED_URLS,
  STORAGE_KEYS,
  type ExtensionSettings,
  type PathMappingRow,
} from '../shared/storage-types';
import { normalizeInstanceUrl } from '../shared/url-match';

const urlList = document.getElementById('url-list') as HTMLUListElement;
const mappingBody = document.getElementById('mapping-body') as HTMLTableSectionElement;
const addUrlBtn = document.getElementById('add-url') as HTMLButtonElement;
const addMappingBtn = document.getElementById('add-mapping') as HTMLButtonElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const showPartnerIcons = document.getElementById('show-partner-icons') as HTMLInputElement;
const showOwnProfileIcon = document.getElementById('show-own-profile-icon') as HTMLInputElement;
const replaceFoldersPageNames = document.getElementById('replace-folders-page-names') as HTMLInputElement;
const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;

function syncOwnProfileCheckboxEnabled(): void {
  showOwnProfileIcon.disabled = !showPartnerIcons.checked;
}

function rowUrl(value: string): HTMLLIElement {
  const li = document.createElement('li');
  const input = document.createElement('input');
  input.type = 'url';
  input.placeholder = 'https://immich.example.com';
  input.value = value;
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'danger';
  rm.textContent = 'Remove';
  rm.addEventListener('click', () => li.remove());
  li.append(input, rm);
  return li;
}

function rowMapping(localPath: string, immichPath: string): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const tdL = document.createElement('td');
  const tdR = document.createElement('td');
  const tdX = document.createElement('td');
  const inL = document.createElement('input');
  inL.type = 'text';
  inL.placeholder = '/var/lib/immich';
  inL.value = localPath;
  const inR = document.createElement('input');
  inR.type = 'text';
  inR.placeholder = '/usr/src/app/upload';
  inR.value = immichPath;
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'danger';
  rm.textContent = '×';
  rm.addEventListener('click', () => tr.remove());
  tdL.append(inL);
  tdR.append(inR);
  tdX.append(rm);
  tr.append(tdL, tdR, tdX);
  return tr;
}

function collectUrls(): string[] {
  const inputs = urlList.querySelectorAll<HTMLInputElement>('input');
  const out: string[] = [];
  inputs.forEach((i) => {
    const n = normalizeInstanceUrl(i.value);
    if (n) out.push(n);
  });
  return out.slice(0, MAX_ENABLED_URLS);
}

function collectMappings(): PathMappingRow[] {
  const rows = mappingBody.querySelectorAll('tr');
  const out: PathMappingRow[] = [];
  rows.forEach((tr) => {
    const ins = tr.querySelectorAll<HTMLInputElement>('input');
    if (ins.length >= 2) {
      out.push({ localPath: ins[0].value, immichPath: ins[1].value });
    }
  });
  return filterCompleteMappings(out);
}

function render(settings: ExtensionSettings): void {
  urlList.replaceChildren();
  const urls = settings.enabledUrls.length ? settings.enabledUrls : [''];
  urls.slice(0, MAX_ENABLED_URLS).forEach((u) => urlList.append(rowUrl(u)));

  mappingBody.replaceChildren();
  if (settings.pathMappings.length === 0) {
    mappingBody.append(rowMapping('', ''));
  } else {
    settings.pathMappings.forEach((m) => mappingBody.append(rowMapping(m.localPath, m.immichPath)));
  }

  showPartnerIcons.checked = settings.showPartnerIcons;
  showOwnProfileIcon.checked = settings.showOwnProfileIcon;
  replaceFoldersPageNames.checked = settings.replaceFoldersPageNames;
  syncOwnProfileCheckboxEnabled();
}

function load(): void {
  chrome.storage.sync.get(
    [
      STORAGE_KEYS.enabledUrls,
      STORAGE_KEYS.pathMappings,
      STORAGE_KEYS.replaceFoldersPageNames,
      STORAGE_KEYS.showPartnerIcons,
      STORAGE_KEYS.showOwnProfileIcon,
    ],
    (sync) => {
      const settings: ExtensionSettings = {
        enabledUrls: Array.isArray(sync[STORAGE_KEYS.enabledUrls])
          ? (sync[STORAGE_KEYS.enabledUrls] as string[])
          : DEFAULT_SETTINGS.enabledUrls,
        pathMappings: (Array.isArray(sync[STORAGE_KEYS.pathMappings])
          ? (sync[STORAGE_KEYS.pathMappings] as PathMappingRow[])
          : DEFAULT_SETTINGS.pathMappings
        ).map(normalizePathMappingRow),
        replaceFoldersPageNames:
          typeof sync[STORAGE_KEYS.replaceFoldersPageNames] === 'boolean'
            ? (sync[STORAGE_KEYS.replaceFoldersPageNames] as boolean)
            : DEFAULT_SETTINGS.replaceFoldersPageNames,
        showPartnerIcons:
          typeof sync[STORAGE_KEYS.showPartnerIcons] === 'boolean'
            ? (sync[STORAGE_KEYS.showPartnerIcons] as boolean)
            : DEFAULT_SETTINGS.showPartnerIcons,
        showOwnProfileIcon:
          typeof sync[STORAGE_KEYS.showOwnProfileIcon] === 'boolean'
            ? (sync[STORAGE_KEYS.showOwnProfileIcon] as boolean)
            : DEFAULT_SETTINGS.showOwnProfileIcon,
      };
      const empty = Object.keys(sync).length === 0;
      if (empty) {
        void chrome.storage.sync.set({
          [STORAGE_KEYS.enabledUrls]: DEFAULT_SETTINGS.enabledUrls,
          [STORAGE_KEYS.pathMappings]: DEFAULT_SETTINGS.pathMappings,
          [STORAGE_KEYS.replaceFoldersPageNames]: DEFAULT_SETTINGS.replaceFoldersPageNames,
          [STORAGE_KEYS.showPartnerIcons]: DEFAULT_SETTINGS.showPartnerIcons,
          [STORAGE_KEYS.showOwnProfileIcon]: DEFAULT_SETTINGS.showOwnProfileIcon,
        });
        render(DEFAULT_SETTINGS);
      } else {
        render(settings);
      }
    },
  );
}

function save(): void {
  const urls = collectUrls();
  if (urls.length > MAX_ENABLED_URLS) {
    saveStatus.textContent = `Too many URLs (max ${MAX_ENABLED_URLS}).`;
    saveStatus.style.color = '#b91c1c';
    return;
  }

  const mappings = collectMappings();
  const hasPartial = [...mappingBody.querySelectorAll('tr')].some((tr) => {
    const ins = tr.querySelectorAll<HTMLInputElement>('input');
    if (ins.length < 2) return false;
    const a = ins[0].value.trim();
    const b = ins[1].value.trim();
    return (a && !b) || (!a && b);
  });

  if (hasPartial) {
    saveStatus.textContent = 'Each mapping needs both Local Path and Immich Path, or clear the row.';
    saveStatus.style.color = '#b91c1c';
    return;
  }

  const payload = {
    [STORAGE_KEYS.enabledUrls]: urls,
    [STORAGE_KEYS.pathMappings]: mappings,
    [STORAGE_KEYS.replaceFoldersPageNames]: replaceFoldersPageNames.checked,
    [STORAGE_KEYS.showPartnerIcons]: showPartnerIcons.checked,
    [STORAGE_KEYS.showOwnProfileIcon]: showOwnProfileIcon.checked,
  };

  chrome.storage.sync.set(payload, () => {
    saveStatus.style.color = '#16a34a';
    saveStatus.textContent = 'Saved.';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2500);
  });
}

addUrlBtn.addEventListener('click', () => {
  if (urlList.querySelectorAll('li').length >= MAX_ENABLED_URLS) return;
  urlList.append(rowUrl(''));
});

addMappingBtn.addEventListener('click', () => {
  mappingBody.append(rowMapping('', ''));
});

saveBtn.addEventListener('click', save);

showPartnerIcons.addEventListener('change', () => {
  syncOwnProfileCheckboxEnabled();
});

load();
