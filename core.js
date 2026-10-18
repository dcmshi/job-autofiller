// Pure matching utilities shared by content.js (browser globals) and the tests (Node).
// Top-level declarations use `function` / `var` so re-injecting this file on a
// second icon click doesn't throw "Identifier has already been declared".

// Levenshtein distance using two rows. When maxDistance is given, bails out
// early and returns maxDistance + 1 once no alignment can stay within it.
function getEditDistance(a, b, maxDistance = Infinity) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let prev = [];
  for (let j = 0; j <= a.length; j++) prev[j] = j;

  for (let i = 1; i <= b.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j - 1] + cost, // substitution
        curr[j - 1] + 1,    // insertion
        prev[j] + 1         // deletion
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    prev = curr;
  }
  return prev[a.length];
}

// Lowercase, turn every run of punctuation/separators into a single space
function normalize(str) {
  return String(str ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// "firstName" -> "first Name", "HTMLInput" -> "HTML Input". Only applied to
// code identifiers (name/id) — human-written labels like "LinkedIn" stay intact.
function splitCamelCase(str) {
  return String(str ?? '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

// Synonyms for the default keys. A user key that matches either the canonical
// name or one of its aliases picks up the whole group.
var KEY_ALIASES = {
  'first name':       ['given name', 'forename', 'fname'],
  'last name':        ['surname', 'family name', 'lname'],
  'full name':        ['legal name'],
  'email':            [],
  'phone':            ['mobile', 'cell', 'telephone', 'tel'],
  'city':             ['town'],
  'address':          ['street address', 'street', 'address1', 'address line 1'],
  'postal code':      ['zip', 'zip code', 'postcode'],
  'country':          [],
  'location':         ['current location'],
  'previous company': ['current company', 'current employer', 'employer'],
  'desired role':     ['desired position'],
  'linkedin':         [],
  'github':           [],
  'personal website': ['website', 'personal site', 'homepage'],
  'portfolio':        [],
};

// HTML autocomplete tokens -> canonical key. These declare exactly what a
// field is, so they outrank every text-based signal.
var AUTOCOMPLETE_KEYS = {
  'given-name':     'first name',
  'family-name':    'last name',
  'name':           'full name',
  'email':          'email',
  'tel':            'phone',
  'tel-national':   'phone',
  'street-address': 'address',
  'address-line1':  'address',
  'address-level2': 'city',
  'postal-code':    'postal code',
  'country':        'country',
  'country-name':   'country',
  'organization':   'previous company',
};

// Relative trust in each source of text describing a field
var SIGNAL_WEIGHTS = { label: 4, name: 3, id: 3, placeholder: 2 };
var AUTOCOMPLETE_SCORE = 100;
var ALIAS_FACTOR = 0.9;
var FUZZY_FACTOR = 0.5;
var POSITION_PENALTY = 0.001;

function canonicalKey(normalizedKey) {
  if (KEY_ALIASES[normalizedKey]) return normalizedKey;
  for (const [canonical, aliases] of Object.entries(KEY_ALIASES)) {
    if (aliases.includes(normalizedKey)) return canonical;
  }
  return null;
}

// Precompute normalized terms once per run instead of once per field.
// Keys with empty values are dropped so unfilled defaults never blank a field.
function prepareKeys(userData) {
  const prepared = [];
  for (const [key, value] of Object.entries(userData || {})) {
    if (value == null || String(value).trim() === '') continue;
    const normalized = normalize(key);
    if (!normalized) continue;
    const canonical = canonicalKey(normalized);
    const terms = [{ term: normalized, factor: 1, fuzzy: true }];
    if (canonical) {
      for (const alias of [canonical, ...KEY_ALIASES[canonical]]) {
        if (alias !== normalized) terms.push({ term: alias, factor: ALIAS_FACTOR, fuzzy: false });
      }
    }
    prepared.push({ key, normalized, canonical, terms });
  }
  return prepared;
}

// Normalize the raw text describing a field into the signals findBestKey scores
function buildSignals({ name, id, placeholder, label, autocomplete } = {}) {
  let autocompleteKey = null;
  for (const token of String(autocomplete ?? '').toLowerCase().split(/\s+/)) {
    if (AUTOCOMPLETE_KEYS[token]) autocompleteKey = AUTOCOMPLETE_KEYS[token];
  }
  return {
    autocomplete: autocompleteKey,
    label:        normalize(label),
    name:         normalize(splitCamelCase(name)),
    id:           normalize(splitCamelCase(id)),
    placeholder:  normalize(placeholder),
  };
}

// How well `term` appears in `text`, on whole-word boundaries:
// 1 = exact, FUZZY_FACTOR = within a small edit distance, 0 = no match.
// Words are compared with spaces removed, so "first name" matches the single
// token "firstname" and "github" matches "git hub". Fuzzy matching is only
// allowed for longer terms — short ones like "city" would match too much —
// and never for aliases, where abbreviations like "fname" sit one edit from "name".
// A tiny penalty per starting word breaks ties toward the earlier word, which
// is usually the specific one ("Email Address", "Location (City)").
function termMatch(text, term, allowFuzzy = true) {
  if (!text) return 0;
  const target = term.replace(/ /g, '');
  const allowed = !allowFuzzy ? 0 : target.length >= 8 ? 2 : target.length >= 5 ? 1 : 0;
  const tokens = text.split(' ');
  let best = 0;

  for (let i = 0; i < tokens.length; i++) {
    let joined = '';
    for (let j = i; j < tokens.length; j++) {
      joined += tokens[j];
      if (joined.length > target.length + allowed) break;
      const positionPenalty = 1 - POSITION_PENALTY * i;
      if (joined === target) return positionPenalty;
      if (allowed && getEditDistance(joined, target, allowed) <= allowed) {
        best = Math.max(best, FUZZY_FACTOR * positionPenalty);
      }
    }
  }
  return best;
}

function scoreKey(signals, preparedKey) {
  let score = 0;
  if (signals.autocomplete && signals.autocomplete === preparedKey.canonical) {
    score += AUTOCOMPLETE_SCORE;
  }
  for (const [signal, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    let best = 0;
    for (const { term, factor, fuzzy } of preparedKey.terms) {
      best = Math.max(best, factor * termMatch(signals[signal], term, fuzzy));
    }
    score += weight * best;
  }
  return score;
}

// Highest-scoring key wins; ties go to the longer (more specific) key, so
// "linkedin profile" beats "linkedin" on a "LinkedIn Profile" field.
function findBestKey(signals, preparedKeys) {
  let bestKey = null;
  let bestScore = 0;
  let bestLength = 0;
  for (const preparedKey of preparedKeys) {
    const score = scoreKey(signals, preparedKey);
    if (score > bestScore || (score > 0 && score === bestScore && preparedKey.normalized.length > bestLength)) {
      bestKey = preparedKey.key;
      bestScore = score;
      bestLength = preparedKey.normalized.length;
    }
  }
  return bestKey;
}

// Match the user's value against a <select> (or any list of { text, value }
// options, e.g. a combobox menu or radio group), in order of preference:
// 1. exact text or value
// 2. whole-word containment either way ("Canada" ~ "Canada +1"), so "No"
//    never matches inside "I do not ..."
// 3. a fuzzy distance scaled to the value's length (up to 4 edits), so short
//    values like "SWE" can't drift onto "Yes"
function findBestOption(selectOrOptions, userValue) {
  const normalizedUserValue = normalize(userValue);
  if (!normalizedUserValue) return null;
  const options = Array.from(selectOrOptions.options || selectOrOptions)
    .map(option => ({ option, text: normalize(option.text), value: normalize(option.value) }))
    // Blank placeholder options ("", "--") would match everything
    .filter(o => o.text || o.value);

  const exact = options.find(o => o.text === normalizedUserValue || o.value === normalizedUserValue);
  if (exact) return exact.option;

  const containing = options.find(o => o.text &&
    (termMatch(o.text, normalizedUserValue, false) || termMatch(normalizedUserValue, o.text, false)));
  if (containing) return containing.option;

  const allowed = Math.min(4, Math.floor(normalizedUserValue.length / 3));
  let bestOption = null;
  let lowestDistance = Infinity;
  for (const o of options) {
    // Fuzzy match against both option text and option value
    const distance = Math.min(
      o.text ? getEditDistance(normalizedUserValue, o.text, allowed) : Infinity,
      o.value ? getEditDistance(normalizedUserValue, o.value, allowed) : Infinity
    );
    if (distance <= allowed && distance < lowestDistance) {
      lowestDistance = distance;
      bestOption = o.option;
    }
  }
  return bestOption;
}

// Export for Node.js (tests) — no-op in the browser
if (typeof module !== 'undefined') {
  module.exports = {
    getEditDistance, normalize, splitCamelCase, canonicalKey, prepareKeys,
    buildSignals, termMatch, scoreKey, findBestKey, findBestOption,
    KEY_ALIASES, AUTOCOMPLETE_KEYS,
  };
}
