// Runs the extension against a real page in Playwright's Chromium.
// Usage:
//   node run-autofill.js <url> [--data user-data.json] [--zip] [--headless]
//
//   --data      mappings to seed into chrome.storage (default: user-data.json,
//               falling back to user-data.example.json)
//   --zip       rebuild job-autofiller.zip with package.js and load the
//               extracted bundle instead of the working tree
//   --headless  no browser window; prints the report and exits
//
// Chrome can't install a .zip/.crx from the command line, so the extension is
// loaded unpacked (same as "Load unpacked" in chrome://extensions). Playwright
// can't click the toolbar icon either, so autofill is triggered by calling the
// service worker's injectAutofill() — the same function the icon click runs.
// While the window is open, press Enter in the terminal to autofill again
// (e.g. on the next step of a multi-page form).

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const readline = require('readline');
const zlib     = require('zlib');

const ROOT = path.resolve(__dirname);

function parseArgs(argv) {
  const args = { url: null, data: null, zip: false, headless: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data') args.data = argv[++i];
    else if (argv[i] === '--zip') args.zip = true;
    else if (argv[i] === '--headless') args.headless = true;
    else args.url = argv[i];
  }
  return args;
}

function loadMappings(dataPath) {
  const candidates = dataPath ? [dataPath] : ['user-data.json', 'user-data.example.json'];
  for (const file of candidates) {
    const full = path.resolve(ROOT, file);
    if (fs.existsSync(full)) {
      console.log(`Mappings: ${path.relative(ROOT, full)}`);
      return JSON.parse(fs.readFileSync(full, 'utf8'));
    }
  }
  throw new Error(`No mappings file found (tried ${candidates.join(', ')})`);
}

// Minimal reader for the zips package.js writes (stored or deflated entries),
// so extraction doesn't depend on which `tar`/`unzip` is on PATH
function extractZip(zipPath, destDir) {
  const buf = fs.readFileSync(zipPath);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error(`${zipPath} is not a zip file`);
  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16); // start of central directory

  for (let i = 0; i < entryCount; i++) {
    const method      = buf.readUInt16LE(offset + 10);
    const compSize    = buf.readUInt32LE(offset + 20);
    const nameLen     = buf.readUInt16LE(offset + 28);
    const extraLen    = buf.readUInt16LE(offset + 30);
    const commentLen  = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;

    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const data = buf.subarray(dataStart, dataStart + compSize);
    const target = path.join(destDir, name);
    if (!target.startsWith(destDir + path.sep)) throw new Error(`Unsafe path in zip: ${name}`);
    if (name.endsWith('/')) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, method === 8 ? zlib.inflateRawSync(data) : data);
  }
}

// Build the store zip and extract it, so we load exactly what ships
function extractBundle() {
  execFileSync(process.execPath, [path.join(ROOT, 'package.js')], { cwd: ROOT, stdio: 'inherit' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-autofiller-'));
  extractZip(path.join(ROOT, 'job-autofiller.zip'), dir);
  return dir;
}

// Every fillable field in every frame (cross-origin iframes included)
async function report(page) {
  for (const frame of page.frames()) {
    let fields;
    try {
      fields = await frame.$$eval('input, textarea, select', els => els
        .filter(el => el.tagName !== 'INPUT' || ['text', 'email', 'tel', 'url', 'number', 'search'].includes(el.type))
        .filter(el => el.checkVisibility())
        .map(el => {
          const label = (el.labels && el.labels[0] && el.labels[0].textContent)
            || el.getAttribute('aria-label') || el.name || el.id || el.placeholder || '(unlabelled)';
          let value = el.value;
          // A selected option with an empty value is a "Select..." placeholder
          if (el.tagName === 'SELECT') value = el.value ? el.selectedOptions[0].text : '';
          // react-select keeps the input empty and shows the choice in a sibling
          if (!value && el.getAttribute('role') === 'combobox') {
            const shown = el.closest('[class*="container"]')?.querySelector('[class*="single-value"]');
            value = shown ? shown.textContent : '';
          }
          return { label: label.replace(/\s+/g, ' ').trim().slice(0, 50), value };
        }));
      // One row per radio group: the question (fieldset legend or name) and the checked option
      fields.push(...await frame.$$eval('input[type="radio"][name]', radios => {
        const groups = new Map();
        for (const r of radios) {
          if (!groups.has(r.name)) groups.set(r.name, []);
          groups.get(r.name).push(r);
        }
        return [...groups.entries()].map(([name, group]) => {
          const legend = group[0].closest('fieldset')?.querySelector('legend');
          const checked = group.find(r => r.checked);
          return {
            label: '(radio) ' + ((legend && legend.textContent) || name).replace(/\s+/g, ' ').trim().slice(0, 42),
            value: checked ? ((checked.labels[0] && checked.labels[0].textContent) || checked.value).trim() : '',
          };
        });
      }));
    } catch {
      continue; // frame navigated or detached
    }
    if (!fields.length) continue;
    console.log(`\n${frame === page.mainFrame() ? 'Main frame' : 'iframe'}: ${frame.url().slice(0, 100)}`);
    for (const { label, value } of fields) {
      console.log(`  ${value ? '✓' : '·'} ${label.padEnd(50)} ${value ? JSON.stringify(value.slice(0, 60)) : ''}`);
    }
  }
}

async function autofill(page, sw) {
  const frameCount = page.frames().length;
  let completed = 0;
  const done = new Promise(resolve => {
    const onConsole = msg => {
      if (msg.text() === 'Fuzzy Autofill complete!' && ++completed === frameCount) finish();
    };
    // Frames the scripts can't run in (about:blank, sandboxed) never report back
    const timer = setTimeout(() => finish(), 8000);
    function finish() { clearTimeout(timer); page.off('console', onConsole); resolve(); }
    page.on('console', onConsole);
  });

  const url = page.url();
  await sw.evaluate(async targetUrl => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.url === targetUrl) || tabs.find(t => t.active);
    injectAutofill(tab.id);
  }, url);
  await done;
  console.log(`\nAutofill ran in ${completed}/${frameCount} frame(s)`);
  await report(page);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('Usage: node run-autofill.js <url> [--data user-data.json] [--zip] [--headless]');
    process.exit(1);
  }
  const mappings = loadMappings(args.data);
  const extPath = args.zip ? extractBundle() : ROOT;
  console.log(`Extension: ${extPath}`);
  // Remove the extracted bundle once Chromium has released its files
  const cleanup = () => { if (args.zip) fs.rmSync(extPath, { recursive: true, force: true }); };

  const context = await chromium.launchPersistentContext('', {
    // The default headless shell can't load extensions; the full Chromium build can
    channel: 'chromium',
    headless: args.headless,
    viewport: null,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  await sw.evaluate(m => chrome.storage.local.set({ userMappings: m }), mappings);

  // Bot protection (e.g. CloudFront on Welcome to the Jungle) rejects the
  // "HeadlessChrome" user agent, so present the regular one
  if (args.headless) {
    const probe = await context.newPage();
    const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
    await probe.close();
    await context.setExtraHTTPHeaders({ 'User-Agent': userAgent });
  }

  const page = context.pages()[0] || await context.newPage();
  await page.goto(args.url, { waitUntil: 'load' });
  // Give client-rendered forms (Greenhouse, Lever, Workday) a moment to mount
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  await autofill(page, sw);

  if (args.headless) {
    await context.close();
    cleanup();
    return;
  }

  console.log('\nPress Enter to autofill again, Ctrl+C or close the window to quit.');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', () => autofill(page, sw).catch(err => console.error(err.message)));
  context.on('close', () => { rl.close(); cleanup(); process.exit(0); });
}

run().catch(err => { console.error(err); process.exit(1); });
