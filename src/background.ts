chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage().catch(() => {
      /* ignore */
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'immich-ui-helper:inject-main') {
    return;
  }
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    sendResponse({ ok: false, error: 'no-tab' });
    return;
  }

  chrome.scripting
    .executeScript({
      target: { tabId, allFrames: false },
      files: ['injected.js'],
      world: 'MAIN',
    })
    .then(() => sendResponse({ ok: true }))
    .catch((err: Error) => sendResponse({ ok: false, error: String(err.message) }));

  return true;
});
