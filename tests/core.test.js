const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getEditDistance, normalize, findBestOption } = require('../core.js');

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
