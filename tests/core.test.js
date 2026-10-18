const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  getEditDistance, normalize, splitCamelCase, canonicalKey, withDerivedValues,
  prepareKeys, isLongQuestion, buildSignals, termMatch, rankKeys, findBestKey,
  findBestOption,
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

describe('findBestOption: exact, whole-word, then length-scaled fuzzy', () => {
  test('an exact match beats an earlier option that merely contains the value', () => {
    const select = mockSelect([['Yes, with sponsorship', 'a'], ['Yes', 'b']]);
    assert.equal(findBestOption(select, 'Yes').value, 'b');
  });

  test('"No" does not match inside "I do not ..."', () => {
    const select = mockSelect([['I do not wish to answer', 'decline'], ['No', 'no'], ['Yes', 'yes']]);
    assert.equal(findBestOption(select, 'No').value, 'no');
  });

  test('"No" does not match "Non-binary" or "None"', () => {
    const select = mockSelect([['Non-binary', 'nb'], ['None', 'none']]);
    assert.equal(findBestOption(select, 'No'), null);
  });

  test('whole-word containment works in both directions', () => {
    const options = [{ text: 'Native', value: '' }, { text: 'Bilingual', value: '' }];
    assert.equal(findBestOption(options, 'Bilingual (French/English)'), options[1]);
    assert.equal(findBestOption(mockSelect([['Canada +1', 'CA']]), 'Canada').value, 'CA');
  });

  test('short values never fuzzy-match short options ("SWE" is not "Yes")', () => {
    const select = mockSelect([['Yes', 'yes'], ['No', 'no']]);
    assert.equal(findBestOption(select, 'SWE'), null);
  });

  test('typos in longer values still match', () => {
    const select = mockSelect([['Intermediate', '1'], ['Fluent', '2']]);
    assert.equal(findBestOption(select, 'Intermediat').value, '1');
    assert.equal(findBestOption(mockSelect([['Canada', 'CA']]), 'Canda').value, 'CA');
  });
});

// ------------------------------------------------------------
// Findings from live ATS forms (Workable, Lever, Ashby, Greenhouse)
// ------------------------------------------------------------
describe('rankKeys: fallback order for option fields', () => {
  test('returns every matching key, best first', () => {
    const keys = prepareKeys({ 'country': 'Canada', 'authorized to work': 'Yes', 'email': 'x' });
    const signals = buildSignals({ label: 'Are you eligible to work in the country you are applying?' });
    assert.deepEqual(rankKeys(signals, keys), ['country', 'authorized to work']);
  });

  test('findBestKey is the first ranked key', () => {
    const keys = prepareKeys({ 'linkedin': 'a', 'linkedin profile': 'b' });
    const signals = buildSignals({ label: 'LinkedIn Profile' });
    assert.equal(findBestKey(signals, keys), rankKeys(signals, keys)[0]);
  });

  test('no matching keys gives an empty list', () => {
    assert.deepEqual(rankKeys(buildSignals({ label: 'Favourite colour' }), prepareKeys({ email: 'x' })), []);
  });
});

describe('Screening-question synonyms', () => {
  const keys = ['authorized to work', 'require sponsorship', 'how did you hear'];
  test('eligible / right to work -> authorized to work', () => {
    assert.equal(matchField({ label: 'Are you legally eligible to work in Canada?' }, keys), 'authorized to work');
    assert.equal(matchField({ label: 'Do you have the right to work in the UK?' }, keys), 'authorized to work');
  });

  test('visa sponsorship -> require sponsorship', () => {
    assert.equal(matchField({ label: 'Will you now or in the future need visa sponsorship?' }, keys), 'require sponsorship');
  });

  test('"hear about us" -> how did you hear', () => {
    assert.equal(matchField({ label: 'Where did you hear about us?' }, keys), 'how did you hear');
  });

  test('a user key named "work authorization" picks up the group', () => {
    assert.equal(matchField({ label: 'Are you authorized to work in the US?' }, ['work authorization']), 'work authorization');
  });
});

describe('Full name derived from first + last name', () => {
  test('adds "full name" when only first and last are given', () => {
    assert.equal(withDerivedValues({ 'first name': 'Jane', 'last name': 'Doe' })['full name'], 'Jane Doe');
  });

  test('works with alias keys like "given name" / "surname"', () => {
    assert.equal(withDerivedValues({ 'given name': 'Jane', 'surname': 'Doe' })['full name'], 'Jane Doe');
  });

  test("never overrides the user's own full name", () => {
    const data = withDerivedValues({ 'first name': 'Jane', 'last name': 'Doe', 'legal name': 'Jane Q. Doe' });
    assert.equal(data['full name'], undefined);
    assert.equal(data['legal name'], 'Jane Q. Doe');
  });

  test('fills in an empty "full name" default', () => {
    assert.equal(withDerivedValues({ 'full name': '', 'first name': 'Jane', 'last name': 'Doe' })['full name'], 'Jane Doe');
  });

  test('needs both first and last name', () => {
    assert.equal(withDerivedValues({ 'first name': 'Jane' })['full name'], undefined);
  });

  test('does not modify the original object', () => {
    const original = { 'first name': 'Jane', 'last name': 'Doe' };
    withDerivedValues(original);
    assert.equal(original['full name'], undefined);
  });
});

describe('Whole-signal aliases ("Name" means full name only on its own)', () => {
  const keys = ['first name', 'last name', 'full name', 'previous company'];
  test('a field labelled just "Name" or "Full name" gets the full name', () => {
    assert.equal(matchField({ label: 'Name' }, keys), 'full name');
    assert.equal(matchField({ label: 'Full name ✱' }, keys), 'full name');
    assert.equal(matchField({ name: 'name' }, keys), 'full name');
  });

  test('"First Name" / "Last Name" still win over full name', () => {
    assert.equal(matchField({ label: 'First Name' }, keys), 'first name');
    assert.equal(matchField({ label: 'Last Name' }, keys), 'last name');
  });

  test('"name" inside a longer label does not mean full name', () => {
    assert.equal(matchField({ label: 'What is the name of your current manager?' }, keys), null);
    assert.equal(matchField({ label: 'Company name' }, keys), null);
  });
});

describe('Long question labels on free-text fields', () => {
  const question = 'Share 2–3 of your open-source contributions with links (GitHub PRs, issues, or projects you maintained)';

  test('isLongQuestion counts words after normalizing', () => {
    assert.equal(isLongQuestion('GitHub profile'), false);
    assert.equal(isLongQuestion(question), true);
  });

  test('a long question label is ignored on a free-text field', () => {
    assert.equal(matchField({ label: question, freeText: true }), null);
  });

  test('the same label still counts for selects and radios', () => {
    assert.equal(matchField({ label: question }), 'github');
  });

  test('name/id still match when the label is dropped', () => {
    assert.equal(matchField({ name: 'location', label: 'Current location No location found Try entering a different location Loading please wait', freeText: true }), 'location');
  });

  test('short labels on free-text fields are unaffected', () => {
    assert.equal(matchField({ label: 'Github profile', freeText: true }), 'github');
  });
});
