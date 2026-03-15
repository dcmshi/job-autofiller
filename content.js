// Basic Levenshtein distance for fuzzy matching
function getEditDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(matrix[i][j - 1] + 1, // insertion
                   matrix[i - 1][j] + 1) // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function normalize(str) {
  // Lowercase and remove common separators to improve match rates
  return (str || "").toLowerCase().replace(/[-_]/g, ' ').trim();
}

// For select elements, fuzzy-match the user's value against available option text
function findBestOption(select, userValue) {
  const normalizedUserValue = normalize(userValue);
  let bestOption = null;
  let lowestDistance = Infinity;

  for (const option of select.options) {
    const optionText  = normalize(option.text);
    const optionValue = normalize(option.value);

    // Direct substring match wins immediately
    if (optionText.includes(normalizedUserValue) || normalizedUserValue.includes(optionText)) {
      return option;
    }

    // Fuzzy match against both option text and option value
    const distance = Math.min(
      getEditDistance(normalizedUserValue, optionText),
      getEditDistance(normalizedUserValue, optionValue)
    );
    if (distance < 5 && distance < lowestDistance) {
      lowestDistance = distance;
      bestOption = option;
    }
  }
  return bestOption;
}

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