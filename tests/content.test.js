// DOM-level tests for content.js: injects core.js + content.js into fixture
// pages in headless Chromium (Playwright), with chrome.storage stubbed out.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const CORE_JS    = path.resolve(__dirname, '../core.js');
const CONTENT_JS = path.resolve(__dirname, '../content.js');

const MAPPINGS = {
  'first name':  'Jane',
  'last name':   'Doe',
  'email':       'jane@example.com',
  'phone':       '416-555-0100',
  'city':        'Toronto',
  'location':    'Toronto, ON',
  'linkedin':    'linkedin.com/in/jane',
  'country':     'Canada',
  'degree':      "Bachelor's",
  'cover letter': 'Hello there',
  'postal code': '',
};

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

// Load `html`, inject the extension scripts `times` times, and resolve once
// every run has logged completion. Page errors fail the test.
async function runAutofill(html, { mappings = MAPPINGS, times = 1 } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err));
  await page.setContent(`<!DOCTYPE html><html><body>${html}</body></html>`);
  await page.evaluate(m => {
    window.chrome = { storage: { local: { get: (key, cb) => cb({ userMappings: m }) } } };
  }, mappings);

  for (let i = 0; i < times; i++) {
    const done = page.waitForEvent('console', msg => msg.text() === 'Fuzzy Autofill complete!');
    await page.addScriptTag({ path: CORE_JS });
    await page.addScriptTag({ path: CONTENT_JS });
    await done;
  }
  assert.deepEqual(errors.map(String), []);
  return page;
}

const valueOf = (page, selector) => page.$eval(selector, el => el.value);

describe('Bug 1: textarea value setter', () => {
  test('fills a textarea and keeps filling the fields after it', async () => {
    const page = await runAutofill(`
      <label for="cl">Cover Letter</label><textarea id="cl"></textarea>
      <label for="fn">First Name</label><input type="text" id="fn">
    `);
    assert.equal(await valueOf(page, '#cl'), 'Hello there');
    assert.equal(await valueOf(page, '#fn'), 'Jane');
    await page.close();
  });

  test('React-style value tracking sees the change on inputs and textareas', async () => {
    // Mimics React's inputValueTracking: an instance-level value property that
    // records writes. Assigning el.value would update the tracker and React
    // would then ignore the input event; the native setter bypasses it.
    const page = await runAutofill(`
      <label for="fn">First Name</label><input type="text" id="fn">
      <label for="cl">Cover Letter</label><textarea id="cl"></textarea>
      <script>
        for (const el of document.querySelectorAll('#fn, #cl')) {
          const proto = Object.getPrototypeOf(el);
          const native = Object.getOwnPropertyDescriptor(proto, 'value');
          let tracked = '';
          Object.defineProperty(el, 'value', {
            configurable: true,
            get() { return native.get.call(this); },
            set(v) { tracked = String(v); native.set.call(this, v); },
          });
          el.addEventListener('input', () => {
            if (el.value !== tracked) el.dataset.reactSawChange = 'yes';
          });
        }
      </script>
    `);
    assert.equal(await page.$eval('#fn', el => el.dataset.reactSawChange), 'yes');
    assert.equal(await page.$eval('#cl', el => el.dataset.reactSawChange), 'yes');
    await page.close();
  });
});

describe('Bug 2: inputs without a type attribute', () => {
  test('fills <input> with no type and with an unknown type', async () => {
    const page = await runAutofill(`
      <label for="fn">First Name</label><input id="fn">
      <label for="ln">Last Name</label><input id="ln" type="bogus">
      <label for="em">Email</label><input id="em" type="email">
    `);
    assert.equal(await valueOf(page, '#fn'), 'Jane');
    assert.equal(await valueOf(page, '#ln'), 'Doe');
    assert.equal(await valueOf(page, '#em'), 'jane@example.com');
    await page.close();
  });

  test('leaves checkboxes, radios, passwords and hidden inputs alone', async () => {
    const page = await runAutofill(`
      <label for="cb">Email</label><input id="cb" type="checkbox" value="orig">
      <label for="pw">Email</label><input id="pw" type="password">
      <input id="hd" type="hidden" name="email">
    `);
    assert.equal(await valueOf(page, '#cb'), 'orig');
    assert.equal(await valueOf(page, '#pw'), '');
    assert.equal(await valueOf(page, '#hd'), '');
    await page.close();
  });
});

describe('Bug 3: best key wins in the real page', () => {
  test('Greenhouse Location (City) gets the location value', async () => {
    const page = await runAutofill(`
      <label for="candidate-location">Location (City)*</label>
      <input type="text" id="candidate-location">
    `);
    assert.equal(await valueOf(page, '#candidate-location'), 'Toronto, ON');
    await page.close();
  });
});

// A minimal react-select-like combobox: clicking closes any open menu and
// renders a `.select__menu-list` after `delay` ms (0 = synchronously).
// Picking an option stores its text in data-selected.
const COMBOBOX_LIB = `
  <script>
    function makeCombobox(input, options, { delay = 30, listboxId = null, search = false } = {}) {
      function render(items) {
        document.querySelectorAll('.select__menu-list.live').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'select__menu-list live';
        if (listboxId) { menu.id = listboxId; input.setAttribute('aria-controls', listboxId); }
        for (const text of items) {
          const opt = document.createElement('div');
          opt.setAttribute('role', 'option');
          opt.textContent = text;
          opt.addEventListener('click', () => { input.dataset.selected = text; menu.remove(); });
          menu.appendChild(opt);
        }
        input.after(menu);
      }
      input.addEventListener('click', () => {
        document.querySelectorAll('.select__menu-list.live').forEach(m => m.remove());
        const items = search ? [] : options;
        delay === 0 ? render(items) : setTimeout(() => render(items), delay);
      });
      if (search) {
        input.addEventListener('input', () => {
          const q = input.value.toLowerCase().split(',')[0];
          setTimeout(() => render(options.filter(o => o.toLowerCase().includes(q))), 50);
        });
      }
    }
  </script>
`;

describe('Bug 4: comboboxes are filled one at a time', () => {
  test('two comboboxes sharing the global menu class each get their own value', async () => {
    const page = await runAutofill(`
      ${COMBOBOX_LIB}
      <label for="country">Country</label><input id="country" role="combobox">
      <label for="degree">Degree</label><input id="degree" role="combobox">
      <script>
        makeCombobox(document.getElementById('country'), ['United States', 'Canada', 'Mexico']);
        makeCombobox(document.getElementById('degree'), ["High School", "Bachelor's", "Master's"]);
      </script>
    `);
    assert.equal(await page.$eval('#country', el => el.dataset.selected), 'Canada');
    assert.equal(await page.$eval('#degree', el => el.dataset.selected), "Bachelor's");
    await page.close();
  });

  test('async search combobox types the value then picks a result', async () => {
    const page = await runAutofill(`
      ${COMBOBOX_LIB}
      <label for="loc">Location (City)</label><input id="loc" role="combobox">
      <script>
        makeCombobox(document.getElementById('loc'),
          ['Toronto, ON, Canada', 'Ottawa, ON, Canada'], { search: true });
      </script>
    `);
    assert.equal(await page.$eval('#loc', el => el.dataset.selected), 'Toronto, ON, Canada');
    await page.close();
  });
});

describe('Matching 2: label detection', () => {
  test('<label> wrapping the field', async () => {
    const page = await runAutofill(`<label>First Name <input id="f"></label>`);
    assert.equal(await valueOf(page, '#f'), 'Jane');
    await page.close();
  });

  test('wrapping label text ignores the <option>s of a wrapped select', async () => {
    const page = await runAutofill(`
      <label>Country <select id="s"><option value=""></option><option>Email me</option><option>Canada</option></select></label>
    `);
    assert.equal(await valueOf(page, '#s'), 'Canada');
    await page.close();
  });

  test('aria-label', async () => {
    const page = await runAutofill(`<input id="f" aria-label="Last name">`);
    assert.equal(await valueOf(page, '#f'), 'Doe');
    await page.close();
  });

  test('aria-labelledby with multiple ids', async () => {
    const page = await runAutofill(`
      <span id="l1">Your</span><span id="l2">Email</span>
      <input id="f" aria-labelledby="l1 l2">
    `);
    assert.equal(await valueOf(page, '#f'), 'jane@example.com');
    await page.close();
  });

  test('<legend> of a fieldset holding only this field', async () => {
    const page = await runAutofill(`<fieldset><legend>Phone</legend><input id="f"></fieldset>`);
    assert.equal(await valueOf(page, '#f'), '416-555-0100');
    await page.close();
  });

  test('a shared <legend> is not applied to every field in the fieldset', async () => {
    const page = await runAutofill(`
      <fieldset><legend>Email preferences</legend><input id="a"><input id="b"></fieldset>
    `);
    assert.equal(await valueOf(page, '#a'), '');
    assert.equal(await valueOf(page, '#b'), '');
    await page.close();
  });

  test('Lever-style nearby label text', async () => {
    const page = await runAutofill(`
      <ul>
        <li class="application-question">
          <div class="application-label"><div class="text">LinkedIn URL</div></div>
          <div class="application-field"><input name="urls[LinkedIn]" id="li"></div>
        </li>
        <li class="application-question">
          <div class="application-label"><div class="text">Current location</div></div>
          <div class="application-field"><input name="q_abc" id="loc"></div>
        </li>
      </ul>
    `);
    assert.equal(await valueOf(page, '#li'), 'linkedin.com/in/jane');
    assert.equal(await valueOf(page, '#loc'), 'Toronto, ON');
    await page.close();
  });

  test('ids with characters that would break a CSS selector', async () => {
    const page = await runAutofill(`
      <label for='q"1:first]'>First Name</label><input id='q"1:first]'>
    `);
    assert.equal(await page.$eval('input', el => el.value), 'Jane');
    await page.close();
  });
});

describe('Matching 7: fields that should be skipped', () => {
  test('keeps values the user already entered', async () => {
    const page = await runAutofill(`
      <label for="fn">First Name</label><input id="fn" value="Janet">
      <label for="c">Country</label>
      <select id="c"><option value="">Select</option><option>Mexico</option><option>Canada</option></select>
      <script>document.getElementById('c').value = 'Mexico';</script>
    `);
    assert.equal(await valueOf(page, '#fn'), 'Janet');
    assert.equal(await valueOf(page, '#c'), 'Mexico');
    await page.close();
  });

  test('fills a select whose page default is a real option', async () => {
    const page = await runAutofill(`
      <label for="c">Country</label>
      <select id="c"><option>United States</option><option selected>Mexico</option><option>Canada</option></select>
    `);
    assert.equal(await valueOf(page, '#c'), 'Canada');
    await page.close();
  });

  test('skips disabled and read-only fields', async () => {
    const page = await runAutofill(`
      <label for="a">First Name</label><input id="a" disabled>
      <label for="b">Last Name</label><input id="b" readonly>
    `);
    assert.equal(await valueOf(page, '#a'), '');
    assert.equal(await valueOf(page, '#b'), '');
    await page.close();
  });

  test('skips hidden and honeypot fields', async () => {
    const page = await runAutofill(`
      <label for="a">Email</label><input id="a" style="display:none">
      <label for="b">Email</label><input id="b" style="visibility:hidden">
      <label for="c">Email</label><input id="c" style="position:absolute;left:-9999px">
      <div aria-hidden="true"><label for="d">Email</label><input id="d"></div>
      <label for="e">Email</label><input id="e" style="width:0;height:0;border:0;padding:0">
      <label for="real">Email</label><input id="real">
    `);
    for (const id of ['a', 'b', 'c', 'd', 'e']) assert.equal(await valueOf(page, '#' + id), '', id);
    assert.equal(await valueOf(page, '#real'), 'jane@example.com');
    await page.close();
  });

  test('does not touch fields for keys whose value is empty', async () => {
    const page = await runAutofill(`<label for="z">Postal Code</label><input id="z">`);
    assert.equal(await valueOf(page, '#z'), '');
    await page.close();
  });
});

describe('Matching 8: shadow DOM, listbox lookup, menus that open synchronously', () => {
  test('fills fields inside open shadow roots', async () => {
    const page = await runAutofill(`
      <x-form></x-form>
      <script>
        const host = document.querySelector('x-form');
        host.attachShadow({ mode: 'open' }).innerHTML =
          '<label for="fn">First Name</label><input id="fn">';
      </script>
    `);
    const value = await page.$eval('x-form', h => h.shadowRoot.getElementById('fn').value);
    assert.equal(value, 'Jane');
    await page.close();
  });

  test('uses the listbox named by aria-controls, not a stray .select__menu-list', async () => {
    const page = await runAutofill(`
      ${COMBOBOX_LIB}
      <div class="select__menu-list"><div role="option">Canada (decoy)</div></div>
      <label for="country">Country</label><input id="country" role="combobox">
      <script>
        makeCombobox(document.getElementById('country'),
          ['United States', 'Canada'], { listboxId: 'country-listbox' });
      </script>
    `);
    assert.equal(await page.$eval('#country', el => el.dataset.selected), 'Canada');
    await page.close();
  });

  test('picks from a menu that renders synchronously on click', async () => {
    const page = await runAutofill(`
      ${COMBOBOX_LIB}
      <label for="country">Country</label><input id="country" role="combobox">
      <script>
        makeCombobox(document.getElementById('country'),
          ['United States', 'Canada'], { delay: 0, listboxId: 'lb' });
      </script>
    `);
    assert.equal(await page.$eval('#country', el => el.dataset.selected), 'Canada');
    await page.close();
  });

  test('injecting the scripts a second time does not throw', async () => {
    const page = await runAutofill(`<label for="fn">First Name</label><input id="fn">`, { times: 2 });
    assert.equal(await valueOf(page, '#fn'), 'Jane');
    await page.close();
  });
});

describe('Radio buttons', () => {
  const RADIO_MAPPINGS = {
    ...MAPPINGS,
    'how did you hear': 'Welcome to the Jungle',
    'french level': 'Bilingue',
    'authorized to work': 'Yes',
    'require sponsorship': 'No',
  };
  const run = html => runAutofill(html, { mappings: RADIO_MAPPINGS });
  const checkedValue = (page, name) =>
    page.$eval(`input[name="${name}"]:checked`, el => el.value).catch(() => null);

  test('Teamtailor-style fieldset + legend with label[for] options', async () => {
    const page = await run(`
      <form>
        <fieldset>
          <legend><span>How did you hear about us?<sup aria-hidden="true">*</sup><span>Required</span></span></legend>
          <div><input type="radio" name="c[0][choice]" id="o1" value="1"><label for="o1">LinkedIn</label></div>
          <div><input type="radio" name="c[0][choice]" id="o2" value="2"><label for="o2">Welcome to the Jungle</label></div>
          <div><input type="radio" name="c[0][choice]" id="o3" value="3"><label for="o3">Indeed</label></div>
        </fieldset>
        <fieldset>
          <legend>French level</legend>
          <label><input type="radio" name="c[1][choice]" value="1"> Intermédiaire</label>
          <label><input type="radio" name="c[1][choice]" value="2"> Bilingue</label>
          <label><input type="radio" name="c[1][choice]" value="3"> Natif</label>
        </fieldset>
      </form>
    `);
    assert.equal(await checkedValue(page, 'c[0][choice]'), '2');
    assert.equal(await checkedValue(page, 'c[1][choice]'), '2');
    await page.close();
  });

  test('role="radiogroup" labelled by aria-labelledby', async () => {
    const page = await run(`
      <p id="q">Are you authorized to work in Canada?</p>
      <div role="radiogroup" aria-labelledby="q">
        <label><input type="radio" name="auth" value="y"> Yes</label>
        <label><input type="radio" name="auth" value="n"> No</label>
      </div>
    `);
    assert.equal(await checkedValue(page, 'auth'), 'y');
    await page.close();
  });

  test('question taken from nearby text, not from the option labels', async () => {
    const page = await run(`
      <div class="question">
        <p>Will you now or in the future require sponsorship?</p>
        <label><input type="radio" name="spons" value="yes"> Yes</label>
        <label><input type="radio" name="spons" value="no"> No</label>
      </div>
      <div class="question">
        <p>Are you authorized to work here?</p>
        <label><input type="radio" name="auth" value="yes"> Yes</label>
        <label><input type="radio" name="auth" value="no"> No</label>
      </div>
    `);
    assert.equal(await checkedValue(page, 'spons'), 'no');
    assert.equal(await checkedValue(page, 'auth'), 'yes');
    await page.close();
  });

  test('a "Yes" answer does not pick "Yes, with sponsorship"', async () => {
    const page = await run(`
      <fieldset><legend>Authorized to work</legend>
        <label><input type="radio" name="a" value="1"> Yes, with sponsorship</label>
        <label><input type="radio" name="a" value="2"> Yes</label>
        <label><input type="radio" name="a" value="3"> No</label>
      </fieldset>
    `);
    assert.equal(await checkedValue(page, 'a'), '2');
    await page.close();
  });

  test('fires click, input and change events', async () => {
    const page = await run(`
      <fieldset><legend>French level</legend>
        <label><input type="radio" name="f" value="b"> Bilingue</label>
      </fieldset>
      <script>
        const r = document.querySelector('input[name=f]');
        r.dataset.events = '';
        for (const t of ['click', 'input', 'change']) r.addEventListener(t, () => r.dataset.events += t + ' ');
      </script>
    `);
    assert.equal(await page.$eval('input[name=f]', r => r.dataset.events.trim()), 'click input change');
    await page.close();
  });

  test('custom-styled radios with a hidden <input> are still filled', async () => {
    const page = await run(`
      <fieldset><legend>French level</legend>
        <label><input type="radio" name="f" value="1" style="position:absolute;opacity:0;width:0;height:0"> <span>Natif</span></label>
        <label><input type="radio" name="f" value="2" style="position:absolute;opacity:0;width:0;height:0"> <span>Bilingue</span></label>
      </fieldset>
    `);
    assert.equal(await checkedValue(page, 'f'), '2');
    await page.close();
  });

  test('keeps an answer the user already picked, overrides the page default', async () => {
    const page = await run(`
      <fieldset><legend>French level</legend>
        <label><input type="radio" name="picked" value="1"> Natif</label>
        <label><input type="radio" name="picked" value="2"> Bilingue</label>
      </fieldset>
      <fieldset><legend>Authorized to work</legend>
        <label><input type="radio" name="dflt" value="no" checked> No</label>
        <label><input type="radio" name="dflt" value="yes"> Yes</label>
      </fieldset>
      <script>document.querySelector('input[name=picked][value="1"]').checked = true;</script>
    `);
    assert.equal(await checkedValue(page, 'picked'), '1');
    assert.equal(await checkedValue(page, 'dflt'), 'yes');
    await page.close();
  });

  test('skips disabled options, hidden groups, and groups with no matching option', async () => {
    const page = await run(`
      <fieldset><legend>French level</legend>
        <label><input type="radio" name="dis" value="2" disabled> Bilingue</label>
        <label><input type="radio" name="dis" value="1"> Natif</label>
      </fieldset>
      <fieldset style="display:none"><legend>Authorized to work</legend>
        <label><input type="radio" name="hidden" value="yes"> Yes</label>
      </fieldset>
      <fieldset><legend>Require sponsorship</legend>
        <label><input type="radio" name="nomatch" value="1"> Maybe later</label>
      </fieldset>
    `);
    assert.equal(await checkedValue(page, 'dis'), null);
    assert.equal(await checkedValue(page, 'hidden'), null);
    assert.equal(await checkedValue(page, 'nomatch'), null);
    await page.close();
  });

  test('same radio name in two forms is treated as two groups', async () => {
    const page = await run(`
      <form id="f1"><fieldset><legend>Authorized to work</legend>
        <label><input type="radio" name="q" value="yes"> Yes</label><label><input type="radio" name="q" value="no"> No</label>
      </fieldset></form>
      <form id="f2"><fieldset><legend>Require sponsorship</legend>
        <label><input type="radio" name="q" value="yes"> Yes</label><label><input type="radio" name="q" value="no"> No</label>
      </fieldset></form>
    `);
    assert.equal(await page.$eval('#f1 input:checked', el => el.value), 'yes');
    assert.equal(await page.$eval('#f2 input:checked', el => el.value), 'no');
    await page.close();
  });

  test('a text field next to a radio group keeps its own label', async () => {
    const page = await run(`
      <div><label for="fn">First Name</label><input id="fn"></div>
      <fieldset><legend>French level</legend>
        <label><input type="radio" name="f" value="2"> Bilingue</label>
      </fieldset>
    `);
    assert.equal(await valueOf(page, '#fn'), 'Jane');
    assert.equal(await checkedValue(page, 'f'), '2');
    await page.close();
  });
});
