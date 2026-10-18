// core.js is injected before this file and provides:
// normalize, withDerivedValues, prepareKeys, buildSignals, rankKeys, findBestOption
// Only `function` / `var` at the top level so a second injection doesn't throw.

// Checked against element.type, which reports "text" for <input> with a
// missing or unrecognized type attribute
var FILLABLE_INPUT_TYPES = ['text', 'email', 'tel', 'url', 'number', 'search'];
var MAX_LABEL_LENGTH = 200;

// querySelectorAll that also descends into open shadow roots
function queryAllDeep(root, selector) {
  const results = Array.from(root.querySelectorAll(selector));
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) results.push(...queryAllDeep(el.shadowRoot, selector));
  }
  return results;
}

function getFillableFields(root) {
  return queryAllDeep(root, 'input, textarea, select').filter(el =>
    el.tagName !== 'INPUT' || FILLABLE_INPUT_TYPES.includes(el.type)
  );
}

// Visible text inside `container` that isn't inside any of the `excluded`
// elements (e.g. the field itself, so a wrapped <select> doesn't contribute its
// options). Hidden text — validation errors, loading messages — is skipped.
function getOwnText(container, ...excluded) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (excluded.some(el => el.contains(node))) continue;
    const parent = node.parentElement;
    if (parent && parent.checkVisibility && !parent.checkVisibility({ visibilityProperty: true })) continue;
    text += ' ' + node.textContent;
  }
  return text.trim().slice(0, MAX_LABEL_LENGTH);
}

// aria-label plus the text of every aria-labelledby reference
function getAriaText(el) {
  const parts = [];
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const root = el.getRootNode();
    for (const id of labelledBy.split(/\s+/)) {
      const ref = root.getElementById ? root.getElementById(id) : document.getElementById(id);
      if (ref) parts.push(ref.textContent);
    }
  }
  return parts.join(' ').trim();
}

function getLabelText(el) {
  const parts = [];
  // Covers both <label for="..."> and <label> wrapping the field
  for (const label of el.labels || []) parts.push(getOwnText(label, el));
  parts.push(getAriaText(el));
  // The same text often arrives via both <label for> and aria-labelledby
  const unique = [...new Set(parts.map(p => p.trim()).filter(Boolean))]
    .filter((p, i, all) => !all.some((other, j) => j !== i && normalize(other).includes(normalize(p)) && other.length > p.length));
  if (unique.length) return unique.join(' ');

  // A <legend> only describes this field if the fieldset holds nothing else
  const fieldset = el.closest('fieldset');
  const legend = fieldset && fieldset.querySelector('legend');
  if (legend && getFillableFields(fieldset).length === 1) return legend.textContent;

  // Nearby text (Lever, Workday, ...): the closest ancestor that wraps only
  // this field and contains some text of its own
  let ancestor = el.parentElement;
  for (let depth = 0; ancestor && depth < 4; depth++, ancestor = ancestor.parentElement) {
    if (getFillableFields(ancestor).length > 1) break;
    const text = getOwnText(ancestor, el);
    if (text) return text;
  }
  return '';
}

function isVisible(el) {
  if (el.closest('[aria-hidden="true"]')) return false;
  if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false;
  // Comboboxes often hide their real <input> behind a styled control
  if (el.getAttribute('role') === 'combobox') return true;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  // Honeypots are commonly pushed off-screen to the left or top
  if (rect.right + window.scrollX < 0 || rect.bottom + window.scrollY < 0) return false;
  return true;
}

function isAlreadyFilled(el) {
  if (el.tagName === 'SELECT') {
    // A choice other than the page's own default means the user picked it
    const selected = el.options[el.selectedIndex];
    return el.selectedIndex > 0 && !!selected && !selected.defaultSelected;
  }
  return el.value.trim() !== '';
}

function shouldSkip(el) {
  return el.disabled || el.readOnly || isAlreadyFilled(el) || !isVisible(el);
}

// React tracks the last value it saw via the instance's value property, so set
// it through the native prototype setter that matches the element type
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
              : el instanceof HTMLSelectElement   ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
}

function fillText(el, value) {
  setNativeValue(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Tries each candidate value in turn (best-matching key first) and selects
// the first one that matches an option
function fillSelect(el, values) {
  for (const value of values) {
    const bestOption = findBestOption(el, value);
    if (!bestOption) continue;
    setNativeValue(el, bestOption.value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
}

// Resolves with check()'s first truthy result, or null after timeoutMs.
// Checks once up front in case the DOM already changed synchronously.
// Watches `root` as well as the document when the field lives in a shadow root.
function waitFor(check, timeoutMs, root = document) {
  return new Promise(resolve => {
    const initial = check();
    if (initial) return resolve(initial);
    const observer = new MutationObserver(() => {
      const result = check();
      if (result) { observer.disconnect(); clearTimeout(timer); resolve(result); }
    });
    const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
    if (root !== document) observer.observe(root, { childList: true, subtree: true });
  });
}

// The listbox this combobox controls (react-select only sets aria-controls once
// open), falling back to a Greenhouse react-select menu that wasn't on the page
// before we clicked — `staleMenus` — so an unrelated open menu is never used
function getListbox(input, staleMenus) {
  const root = input.getRootNode();
  for (const attr of ['aria-controls', 'aria-owns']) {
    const id = input.getAttribute(attr);
    const listbox = id && (root.getElementById ? root.getElementById(id) : document.getElementById(id));
    if (listbox) return listbox;
  }
  return Array.from(root.querySelectorAll('.select__menu-list')).find(m => !staleMenus.has(m)) || null;
}

function pickFromMenu(input, value, staleMenus) {
  const listbox = getListbox(input, staleMenus);
  if (!listbox) return false;
  const options = Array.from(listbox.querySelectorAll('[role="option"]'))
    .map(el => ({ text: el.textContent, value: el.getAttribute('data-value') || '', el }));
  if (!options.length) return false;
  const best = findBestOption(options, value);
  if (!best) return false;
  best.el.click();
  return true;
}

async function fillCombobox(input, value) {
  const root = input.getRootNode();
  const staleMenus = new Set(root.querySelectorAll('.select__menu-list'));

  // Click to open the dropdown
  input.click();

  // Phase 1: wait for the menu to appear
  if (!await waitFor(() => getListbox(input, staleMenus), 2000, root)) return;

  // Static dropdown (e.g. Country): options already loaded — pick immediately
  if (pickFromMenu(input, value, staleMenus)) return;

  // Async search dropdown (e.g. Location): type to trigger fetch, then pick
  setNativeValue(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));

  // Phase 2: wait for async options to arrive
  if (!await waitFor(() => pickFromMenu(input, value, staleMenus), 3000, root)) input.blur();
}

// Radio buttons grouped by name, per form (or per document/shadow root
// for radios outside a form). Unnamed radios have no group and are ignored.
function getRadioGroups(root) {
  const scopes = new Map();
  for (const radio of queryAllDeep(root, 'input[type="radio"]')) {
    if (!radio.name) continue;
    const scope = radio.form || radio.getRootNode();
    if (!scopes.has(scope)) scopes.set(scope, new Map());
    const groups = scopes.get(scope);
    if (!groups.has(radio.name)) groups.set(radio.name, []);
    groups.get(radio.name).push(radio);
  }
  return [...scopes.values()].flatMap(groups => [...groups.values()]);
}

function getRadioOptionText(radio) {
  const labelText = Array.from(radio.labels || []).map(label => getOwnText(label, radio)).join(' ');
  return labelText.trim() || getAriaText(radio) || radio.value;
}

// The question a radio group answers: a fieldset <legend>, a
// role="radiogroup" label, or nearby text that isn't one of the options
function getRadioGroupQuestion(radios) {
  // Smallest element containing every radio in the group
  let container = radios[0].parentElement;
  while (container && !radios.every(r => container.contains(r))) container = container.parentElement;

  const optionLabels = radios.flatMap(r => Array.from(r.labels || []));
  for (let el = container, depth = 0; el && depth < 4; el = el.parentElement, depth++) {
    const legend = el.tagName === 'FIELDSET' && el.querySelector('legend');
    if (legend) return legend.textContent;
    if (el.getAttribute('role') === 'radiogroup' && getAriaText(el)) return getAriaText(el);

    // Past this point the text could belong to some other question
    const otherRadios = queryAllDeep(el, 'input[type="radio"]').some(r => !radios.includes(r));
    if (otherRadios || getFillableFields(el).length) break;
    const text = getOwnText(el, ...radios, ...optionLabels);
    if (text) return text;
  }
  return '';
}

function shouldSkipRadioGroup(radios) {
  // A choice other than the page's own default means the user picked it
  if (radios.some(r => r.checked && !r.defaultChecked)) return true;
  // Styled radios often hide the <input> and show only its label
  const visible = radios.some(r => isVisible(r) ||
    Array.from(r.labels || []).some(label => label.checkVisibility()));
  return !visible || radios.every(r => r.disabled);
}

// Like fillSelect: the first candidate value that matches an option wins
function fillRadioGroup(radios, values) {
  const options = radios
    .filter(r => !r.disabled)
    .map(r => ({ text: getRadioOptionText(r), value: r.value, el: r }));
  for (const value of values) {
    const best = findBestOption(options, value);
    if (!best) continue;
    // click() checks the radio and fires click/input/change like a real click
    if (!best.el.checked) best.el.click();
    return;
  }
}

async function autofill(rawUserData) {
  const userData = withDerivedValues(rawUserData);
  const preparedKeys = prepareKeys(userData);
  const comboboxes = [];

  for (const el of getFillableFields(document)) {
    if (shouldSkip(el)) continue;

    const isCombobox = el.getAttribute('role') === 'combobox';
    const signals = buildSignals({
      name:         el.getAttribute('name'),
      id:           el.id,
      placeholder:  el.getAttribute('placeholder'),
      label:        getLabelText(el),
      autocomplete: el.getAttribute('autocomplete'),
      freeText:     el.tagName !== 'SELECT' && !isCombobox,
    });
    const keys = rankKeys(signals, preparedKeys);
    if (!keys.length) continue;

    if (isCombobox) {
      comboboxes.push([el, userData[keys[0]]]);
    } else if (el.tagName === 'SELECT') {
      fillSelect(el, keys.map(key => userData[key]));
    } else {
      fillText(el, userData[keys[0]]);
    }
  }

  for (const radios of getRadioGroups(document)) {
    if (shouldSkipRadioGroup(radios)) continue;
    const signals = buildSignals({
      name:  radios[0].name,
      label: getRadioGroupQuestion(radios),
    });
    const keys = rankKeys(signals, preparedKeys);
    if (keys.length) fillRadioGroup(radios, keys.map(key => userData[key]));
  }

  // One at a time — open menus would otherwise compete for the same listbox
  for (const [el, value] of comboboxes) await fillCombobox(el, value);
}

// Pull dynamic data from storage before running
chrome.storage.local.get('userMappings', async (result) => {
  if (result.userMappings) {
    await autofill(result.userMappings);
    console.log("Fuzzy Autofill complete!");
  } else {
    console.log("No mappings found. Please configure the extension options.");
  }
});
