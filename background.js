// Named so dev tooling (run-autofill.js) can trigger the same injection from
// the service worker — Playwright can't click the toolbar icon
function injectAutofill(tabId) {
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['core.js', 'content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.warn('Job Autofiller: could not inject script —', chrome.runtime.lastError.message);
    }
  });
}

chrome.action.onClicked.addListener((tab) => injectAutofill(tab.id));
