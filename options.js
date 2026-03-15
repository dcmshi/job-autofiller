// Load saved data, falling back to user-data.json defaults
fetch(chrome.runtime.getURL('user-data.json'))
  .then(res => res.json())
  .then(defaultData => {
    chrome.storage.local.get({ userMappings: defaultData }, (result) => {
      document.getElementById('mappingEditor').value = JSON.stringify(result.userMappings, null, 2);
    });
  })
  .catch(() => {
    // user-data.json missing — start with empty mapping
    chrome.storage.local.get({ userMappings: {} }, (result) => {
      document.getElementById('mappingEditor').value = JSON.stringify(result.userMappings, null, 2);
    });
  });

// Save updated data
document.getElementById('saveBtn').addEventListener('click', () => {
  try {
    const updatedData = JSON.parse(document.getElementById('mappingEditor').value);
    chrome.storage.local.set({ userMappings: updatedData }, () => {
      const status = document.getElementById('status');
      status.textContent = ' Mappings saved!';
      setTimeout(() => status.textContent = '', 2000);
    });
  } catch (e) {
    alert("Invalid JSON format. Please check your syntax.");
  }
});