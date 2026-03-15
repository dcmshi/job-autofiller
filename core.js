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

// Export for Node.js (tests) — no-op in the browser
if (typeof module !== 'undefined') {
  module.exports = { getEditDistance, normalize, findBestOption };
}
