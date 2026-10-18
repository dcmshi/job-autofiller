const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  getEditDistance, normalize, splitCamelCase, canonicalKey, prepareKeys,
  buildSignals, termMatch, findBestKey, findBestOption,
} = require('../core.js');

// Helper to build a minimal select mock
function mockSelect(options) {
  return { options: options.map(([text, value]) => ({ text, value })) };
}

// ------------------------------------------------------------
// getEditDistance
// ------------------------------------------------------------
describe('getEditDistance', () => {
  test('identical strings return 0', () => {
    assert.equal(getEditDistance('hello', 'hello'), 0);
  });

  test('empty first string returns length of second', () => {
    assert.equal(getEditDistance('', 'abc'), 3);
  });

  test('empty second string returns length of first', () => {
    assert.equal(getEditDistance('abc', ''), 3);
  });

  test('single substitution', () => {
    assert.equal(getEditDistance('cat', 'bat'), 1);
  });

  test('single insertion', () => {
    assert.equal(getEditDistance('color', 'colour'), 1);
  });

  test('single deletion', () => {
    assert.equal(getEditDistance('name', 'nam'), 1);
  });

  test('completely different strings', () => {
    assert.ok(getEditDistance('abc', 'xyz') > 0);
  });
});

// ------------------------------------------------------------
// normalize
// ------------------------------------------------------------
describe('normalize', () => {
  test('lowercases input', () => {
    assert.equal(normalize('First Name'), 'first name');
  });

  test('replaces hyphens with spaces', () => {
    assert.equal(normalize('first-name'), 'first name');
  });

  test('replaces underscores with spaces', () => {
    assert.equal(normalize('first_name'), 'first name');
  });

  test('trims leading and trailing whitespace', () => {
    assert.equal(normalize('  email  '), 'email');
  });

  test('handles null/undefined gracefully', () => {
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
  });

  test('handles empty string', () => {
    assert.equal(normalize(''), '');
  });
});

// ------------------------------------------------------------
// findBestOption
// ------------------------------------------------------------
describe('findBestOption', () => {
  test('exact substring match returns correct option', () => {
    const select = mockSelect([
      ['Select one', ''],
      ['Yes', 'yes'],
      ['No', 'no'],
    ]);
    const result = findBestOption(select, 'Yes');
    assert.equal(result.value, 'yes');
  });

  test('case-insensitive substring match', () => {
    const select = mockSelect([
      ['Select one', ''],
      ['United States', 'US'],
      ['Canada', 'CA'],
    ]);
    const result = findBestOption(select, 'united states');
    assert.equal(result.value, 'US');
  });

  test('fuzzy match on work authorization', () => {
    const select = mockSelect([
      ['Select one', ''],
      ['I am authorized to work in the US', 'authorized'],
      ['I require sponsorship', 'sponsorship'],
    ]);
    const result = findBestOption(select, 'authorized');
    assert.equal(result.value, 'authorized');
  });

  test('fuzzy match on veteran status', () => {
    const select = mockSelect([
      ['Select one', ''],
      ['I am not a protected veteran', 'not_veteran'],
      ['I identify as a protected veteran', 'veteran'],
    ]);
    const result = findBestOption(select, 'not a protected veteran');
    assert.equal(result.value, 'not_veteran');
  });

  test('returns null when no option is close enough', () => {
    const select = mockSelect([
      ['Foo', 'foo'],
      ['Bar', 'bar'],
    ]);
    const result = findBestOption(select, 'zzzzzzzzzzzzzzz');
    assert.equal(result, null);
  });

  test('matches against option value when text is not a match', () => {
    const select = mockSelect([
      ['Select one', ''],
      ['Option A', 'yes'],
    ]);
    const result = findBestOption(select, 'yes');
    assert.equal(result.value, 'yes');
  });
});

// ------------------------------------------------------------
// Greenhouse form compatibility
// Verifies that the targetString content.js builds from each
// Greenhouse field's id + label matches the expected mapping key.
// targetString = normalize(name + " " + id + " " + placeholder + " " + labelText)
// Greenhouse sets name="", so it's effectively normalize(" " + id + " " + label)
// ------------------------------------------------------------
describe('Greenhouse form compatibility', () => {
  function targetString(id, labelText) {
    return normalize(' ' + id + '  ' + labelText);
  }

  test('first_name field matches "first name" key', () => {
    assert.ok(targetString('first_name', 'First Name*').includes(normalize('first name')));
  });

  test('last_name field matches "last name" key', () => {
    assert.ok(targetString('last_name', 'Last Name*').includes(normalize('last name')));
  });

  test('email field matches "email" key', () => {
    assert.ok(targetString('email', 'Email*').includes(normalize('email')));
  });

  test('phone field matches "phone" key', () => {
    assert.ok(targetString('phone', 'Phone*').includes(normalize('phone')));
  });

  test('candidate-location field matches "location" key', () => {
    assert.ok(targetString('candidate-location', 'Location (City)*').includes(normalize('location')));
  });

  test('LinkedIn question field matches "linkedin" key', () => {
    assert.ok(targetString('question_35710866002', 'LinkedIn Profile').includes(normalize('linkedin')));
  });

  test('country combobox option "Canada +1" matches user value "Canada"', () => {
    const select = mockSelect([
      ['United States +1', 'US'],
      ['Canada +1', 'CA'],
      ['United Kingdom +44', 'GB'],
    ]);
    assert.equal(findBestOption(select, 'Canada').value, 'CA');
  });

  test('country combobox option "United States +1" matches user value "United States"', () => {
    const select = mockSelect([
      ['United States +1', 'US'],
      ['Canada +1', 'CA'],
      ['United Kingdom +44', 'GB'],
    ]);
    assert.equal(findBestOption(select, 'United States').value, 'US');
  });
});

// ------------------------------------------------------------
// Field → key matching (buildSignals + findBestKey)
// ------------------------------------------------------------

// Shorthand: which of `keys` does a field with these attributes match?
const DEFAULT_KEYS = [
  'first name', 'last name', 'email', 'phone', 'city', 'address', 'postal code',
  'location', 'previous company', 'desired role', 'linkedin', 'github',
  'personal website', 'portfolio',
];
function matchField(field, keys = DEFAULT_KEYS) {
  const userData = Object.fromEntries(keys.map(k => [k, 'some value']));
  return findBestKey(buildSignals(field), prepareKeys(userData));
}

describe('getEditDistance early exit', () => {
  test('returns exact distance when within maxDistance', () => {
    assert.equal(getEditDistance('kitten', 'sitting', 3), 3);
  });

  test('returns maxDistance + 1 when the distance exceeds it', () => {
    assert.equal(getEditDistance('kitten', 'sitting', 1), 2);
    assert.equal(getEditDistance('a', 'abcdefgh', 2), 3);
  });
});

describe('Bug 3: best key wins, not the first key in iteration order', () => {
  test('Greenhouse "Location (City)" picks location, not city', () => {
    assert.equal(matchField({ id: 'candidate-location', label: 'Location (City)*' }), 'location');
  });

  test('"Email Address" picks email, not address', () => {
    assert.equal(matchField({ id: 'input_7', label: 'Email Address' }), 'email');
  });

  test('result does not depend on key order', () => {
    const reversed = [...DEFAULT_KEYS].reverse();
    assert.equal(matchField({ id: 'candidate-location', label: 'Location (City)*' }, reversed), 'location');
    assert.equal(matchField({ id: 'input_7', label: 'Email Address' }, reversed), 'email');
  });
});

describe('Matching 1: autocomplete attribute', () => {
  test('given-name maps to first name', () => {
    assert.equal(matchField({ autocomplete: 'given-name', id: 'f1' }), 'first name');
  });

  test('autocomplete outranks a misleading label', () => {
    assert.equal(matchField({ autocomplete: 'family-name', label: 'First name' }), 'last name');
  });

  test('section and shipping/billing prefixes are ignored', () => {
    assert.equal(matchField({ autocomplete: 'section-apply shipping postal-code', id: 'x' }), 'postal code');
  });

  test('autocomplete matches a user key that is an alias of the canonical key', () => {
    assert.equal(matchField({ autocomplete: 'family-name', id: 'x' }, ['first name', 'surname']), 'surname');
  });

  test('"off" / "on" carry no signal', () => {
    assert.equal(buildSignals({ autocomplete: 'off' }).autocomplete, null);
    assert.equal(matchField({ autocomplete: 'on', id: 'x' }), null);
  });
});

describe('Matching 3: camelCase and punctuation', () => {
  test('splitCamelCase splits identifiers', () => {
    assert.equal(splitCamelCase('firstName'), 'first Name');
    assert.equal(splitCamelCase('linkedinURLField'), 'linkedin URL Field');
    assert.equal(splitCamelCase('phone2Number'), 'phone2 Number');
  });

  test('camelCase ids match multi-word keys', () => {
    assert.equal(matchField({ id: 'firstName' }), 'first name');
    assert.equal(matchField({ name: 'lastName' }), 'last name');
    assert.equal(matchField({ id: 'phoneNumber' }), 'phone');
    assert.equal(matchField({ id: 'linkedinUrl' }), 'linkedin');
  });

  test('split brand names still match ("gitHubUrl" -> github)', () => {
    assert.equal(matchField({ id: 'gitHubUrl' }), 'github');
  });

  test('all-lowercase run-together ids match ("firstname")', () => {
    assert.equal(matchField({ name: 'firstname' }), 'first name');
  });

  test('normalize strips asterisks, brackets, parentheses and dots', () => {
    assert.equal(normalize('First Name*'), 'first name');
    assert.equal(normalize('job_application[first_name]'), 'job application first name');
    assert.equal(normalize('Location (City)'), 'location city');
    assert.equal(normalize('user.email'), 'user email');
  });

  test('labels are not camel-split ("LinkedIn" stays one word)', () => {
    assert.equal(buildSignals({ label: 'LinkedIn Profile' }).label, 'linkedin profile');
  });
});

describe('Matching 4: fuzzy fallback per source and word window', () => {
  test('a typo in a long label still matches', () => {
    assert.equal(matchField({ label: 'Frist Name' }), 'first name');
  });

  test('a typo is found even when other attributes add lots of text', () => {
    assert.equal(
      matchField({ name: 'job_application[answers][0]', id: 'q_1234567', label: 'Your Frist Name', placeholder: 'Type here' }),
      'first name'
    );
  });

  test('short keys require an exact word match', () => {
    assert.equal(termMatch('cite', 'city'), 0);
    assert.equal(matchField({ label: 'Cite your sources' }), null);
  });

  test('matches whole words only ("ethnicity" is not "city")', () => {
    assert.equal(termMatch('ethnicity', 'city'), 0);
    assert.equal(matchField({ label: 'Ethnicity' }), null);
  });

  test('fuzzy does not confuse first and last name', () => {
    assert.equal(matchField({ label: 'Last Name' }), 'last name');
    assert.equal(matchField({ label: 'Last Name' }, ['first name']), null);
  });

  test('exact match beats fuzzy match', () => {
    assert.ok(termMatch('first name', 'first name') > termMatch('frist name', 'first name'));
  });
});

describe('Matching 5: synonyms', () => {
  test('surname / family name -> last name', () => {
    assert.equal(matchField({ label: 'Surname' }), 'last name');
    assert.equal(matchField({ label: 'Family Name' }), 'last name');
  });

  test('given name / forename -> first name', () => {
    assert.equal(matchField({ label: 'Given name' }), 'first name');
    assert.equal(matchField({ label: 'Forename' }), 'first name');
  });

  test('mobile / cell / telephone -> phone', () => {
    assert.equal(matchField({ label: 'Mobile' }), 'phone');
    assert.equal(matchField({ label: 'Cell number' }), 'phone');
    assert.equal(matchField({ label: 'Telephone' }), 'phone');
  });

  test('zip / postcode -> postal code', () => {
    assert.equal(matchField({ label: 'ZIP' }), 'postal code');
    assert.equal(matchField({ label: 'Zip Code' }), 'postal code');
    assert.equal(matchField({ label: 'Postcode' }), 'postal code');
  });

  test('e-mail -> email', () => {
    assert.equal(matchField({ label: 'E-mail' }), 'email');
  });

  test('a user key that is itself an alias picks up the group', () => {
    assert.equal(canonicalKey('surname'), 'last name');
    assert.equal(matchField({ id: 'last_name' }, ['surname']), 'surname');
  });

  test('aliases match exactly, never fuzzily ("fname" is not "name")', () => {
    assert.equal(termMatch('last name', 'fname', false), 0);
    assert.equal(matchField({ label: 'Last Name' }, ['first name']), null);
    assert.equal(matchField({ name: 'fname' }), 'first name');
  });

  test('a direct key match outranks an alias match', () => {
    // "website" is an alias of "personal website", but the user also has a "website" key
    assert.equal(matchField({ label: 'Website' }, ['personal website', 'website']), 'website');
  });
});

describe('Matching 6: scoring', () => {
  test('a longer, more specific key wins a tie', () => {
    assert.equal(matchField({ label: 'LinkedIn Profile' }, ['linkedin', 'linkedin profile']), 'linkedin profile');
  });

  test('agreement across several attributes beats a single label hit', () => {
    // label mentions both; name and id agree on phone
    assert.equal(matchField({ name: 'phone', id: 'phone', label: 'Email or phone' }), 'phone');
  });

  test('label outweighs placeholder', () => {
    assert.equal(matchField({ label: 'City', placeholder: 'e.g. 123 Main Street Address' }), 'city');
  });

  test('no match returns null', () => {
    assert.equal(matchField({ id: 'q_123', label: 'Why do you want to work here?' }), null);
  });

  test('keys with empty values are never matched', () => {
    const prepared = prepareKeys({ 'first name': '', 'email': '  ', 'phone': '555' });
    assert.deepEqual(prepared.map(p => p.key), ['phone']);
    assert.equal(findBestKey(buildSignals({ label: 'First Name' }), prepared), null);
  });
});

describe('Matching 8: signal hygiene and option edge cases', () => {
  test('missing attributes do not become the text "undefined" / "null"', () => {
    const signals = buildSignals({ name: null, id: '', placeholder: undefined, label: 'City' });
    assert.equal(signals.name, '');
    assert.equal(signals.placeholder, '');
    assert.equal(matchField({ name: null, placeholder: undefined, label: 'Refund' }, ['undefined', 'null']), null);
  });

  test('findBestOption ignores blank placeholder options', () => {
    const select = mockSelect([['', ''], ['--', ''], ['Canada', 'CA']]);
    assert.equal(findBestOption(select, 'Canada').value, 'CA');
  });

  test('findBestOption returns null for an empty user value', () => {
    const select = mockSelect([['Yes', 'yes'], ['No', 'no']]);
    assert.equal(findBestOption(select, ''), null);
  });

  test('findBestOption accepts a plain array of options (combobox menus)', () => {
    const options = [{ text: 'United States +1', value: '' }, { text: 'Canada +1', value: '' }];
    assert.equal(findBestOption(options, 'Canada'), options[1]);
  });
});
