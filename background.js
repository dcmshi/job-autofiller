chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['core.js', 'content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.warn('Job Autofiller: could not inject script —', chrome.runtime.lastError.message);
    }
  });
});