// core.js is injected before this file and provides:
// getEditDistance, normalize, findBestOption

function autofill(userData) {
  const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea, select');

  inputs.forEach(input => {
    let labelText = "";
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) labelText = label.innerText;
    }

    // Combine useful attributes to check against
    const targetString = normalize(input.name + " " + input.id + " " + input.placeholder + " " + labelText);

    let bestMatchKey = null;
    let lowestDistance = Infinity;

    // Compare target against all your mapping keys
    for (const key of Object.keys(userData)) {
      const normalizedKey = normalize(key);

      // If it's a direct substring match, prefer that immediately
      if (targetString.includes(normalizedKey)) {
        bestMatchKey = key;
        lowestDistance = 0;
        break;
      }

      // Otherwise, check fuzzy distance
      const distance = getEditDistance(targetString, normalizedKey);

      // Threshold for a "good enough" match. You can tweak this.
      // E.g., distance of 3 allows for minor typos or pluralization
      if (distance < 3 && distance < lowestDistance) {
        lowestDistance = distance;
        bestMatchKey = key;
      }
    }

    if (bestMatchKey) {
      if (input.tagName === 'SELECT') {
        const bestOption = findBestOption(input, userData[bestMatchKey]);
        if (bestOption) {
          input.value = bestOption.value;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        input.value = userData[bestMatchKey];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

// Pull dynamic data from storage before running
chrome.storage.local.get('userMappings', (result) => {
  if (result.userMappings) {
    autofill(result.userMappings);
    console.log("Fuzzy Autofill complete!");
  } else {
    console.log("No mappings found. Please configure the extension options.");
  }
});
