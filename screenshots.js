// Generates Chrome Web Store screenshots using Playwright.
// Usage:
//   npm install
//   npx playwright install chromium
//   node screenshots.js
// Output (all JPEG): screenshots/options-page.jpg, screenshots/autofill-in-use.jpg (1280×800),
//   screenshots/promo-small.jpg (440×280), screenshots/promo-marquee.jpg (1400×560)

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const EXT_PATH = path.resolve(__dirname);
const OUT_DIR  = path.resolve(__dirname, 'screenshots');

// Fictional sample data — these screenshots are public on the store listing
const SAMPLE_MAPPINGS = {
  'first name':       'Jane',
  'last name':        'Doe',
  'location':         'Toronto, Canada',
  'previous company': 'Globex Inc.',
  'desired role':     'Software Engineer',
  'linkedin profile': 'https://www.linkedin.com/in/jane-doe-sample',
  'github url':       'https://github.com/jane-doe-sample',
  'work authorization': 'Authorized to work in Canada',
  'veteran status':   'I am not a protected veteran',
};

const MOCK_FORM = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Apply — Software Engineer at Acme Corp</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #F5F5F5; padding: 40px 24px; color: #1a1a1a; }
    .page { max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px 44px; box-shadow: 0 1px 3px rgba(0,0,0,.07), 0 8px 24px rgba(0,0,0,.06); }
    .job-title { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
    .job-meta { color: #666; font-size: 14px; margin-bottom: 32px; }
    .section { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: #999; margin: 28px 0 16px; padding-top: 20px; border-top: 1px solid #eee; }
    .section:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #444; }
    input, select, textarea { width: 100%; padding: 9px 12px; border: 1.5px solid #E0E0E0; border-radius: 8px; font-size: 14px; color: #1a1a1a; background: #fff; }
    input:not([value=""]), select:not([value=""]) { border-color: #3A6FD8; background: #F0F5FF; }
    button { background: #3A6FD8; color: white; border: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="job-title">Software Engineer</div>
    <div class="job-meta">Acme Corp &middot; Toronto, ON &middot; Full-time</div>

    <div class="section">Personal Information</div>
    <div class="row">
      <div class="field"><label for="firstName">First Name</label><input id="firstName" name="first_name" type="text"></div>
      <div class="field"><label for="lastName">Last Name</label><input id="lastName" name="last_name" type="text"></div>
    </div>
    <div class="field"><label for="location">Location</label><input id="location" name="location" type="text"></div>

    <div class="section">Professional Details</div>
    <div class="field"><label for="desiredRole">Desired Role</label><input id="desiredRole" name="desired_role" type="text"></div>
    <div class="field"><label for="prevCompany">Previous Company</label><input id="prevCompany" name="previous_company" type="text"></div>
    <div class="field"><label for="linkedin">LinkedIn Profile URL</label><input id="linkedin" name="linkedin_profile" type="url"></div>
    <div class="field"><label for="github">GitHub URL</label><input id="github" name="github_url" type="url"></div>

    <div class="section">Additional Questions</div>
    <div class="field">
      <label for="workAuth">Work Authorization</label>
      <select id="workAuth" name="work_authorization">
        <option value="">Select one</option>
        <option value="authorized">Authorized to work in Canada</option>
        <option value="sponsorship">Require sponsorship</option>
      </select>
    </div>
    <div class="field">
      <label for="veteran">Veteran Status</label>
      <select id="veteran" name="veteran_status">
        <option value="">Select one</option>
        <option value="not_veteran">I am not a protected veteran</option>
        <option value="veteran">I identify as a protected veteran</option>
      </select>
    </div>

    <button type="button">Submit Application</button>
  </div>
</body>
</html>`;

// ── Promo tiles ──────────────────────────────────────────────────────────────
// Same palette and fonts as the options page. The icon is inlined as a data
// URI because setContent pages can't load local files.

const ICON_URI = 'data:image/png;base64,' +
  fs.readFileSync(path.join(EXT_PATH, 'icons/base_icon_v2.png')).toString('base64');

const TILE_BASE = `
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      font-family: 'DM Sans', sans-serif; color: #fff;
      background: radial-gradient(120% 140% at 0% 0%, #4A7FE6 0%, #3A6FD8 45%, #2D5BBF 100%);
    }
    .icon { background: #fff; border-radius: 50%; box-shadow: 0 8px 24px rgba(10, 30, 80, .25); }
    .title { font-family: 'Playfair Display', serif; font-weight: 600; letter-spacing: -.01em; }
    .tagline { color: rgba(255, 255, 255, .88); }
  </style>`;

const SMALL_TILE = `<!DOCTYPE html><html><head>${TILE_BASE}
  <style>
    body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; }
    .icon { width: 96px; height: 96px; }
    .title { font-size: 32px; }
    .tagline { font-size: 17px; }
  </style></head>
  <body>
    <img class="icon" src="${ICON_URI}">
    <div class="title">Job Form Autofiller</div>
    <div class="tagline">Job applications, filled in one click</div>
  </body></html>`;

const MARQUEE_TILE = `<!DOCTYPE html><html><head>${TILE_BASE}
  <style>
    body { display: flex; align-items: center; justify-content: space-between; padding: 0 110px; }
    .copy { display: flex; flex-direction: column; gap: 22px; max-width: 600px; }
    .brand { display: flex; align-items: center; gap: 22px; }
    .icon { width: 96px; height: 96px; }
    .title { font-size: 58px; line-height: 1.05; }
    .tagline { font-size: 26px; line-height: 1.4; }
    .boards { font-size: 17px; font-weight: 500; color: rgba(255, 255, 255, .7); letter-spacing: .02em; }

    .card {
      width: 470px; background: #fff; color: #1C1917; border-radius: 18px; padding: 30px 30px 26px;
      box-shadow: 0 30px 60px rgba(10, 30, 80, .35); transform: rotate(-2.5deg);
      display: flex; flex-direction: column; gap: 16px;
    }
    .card h3 { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 600; margin-bottom: 2px; }
    .field label { display: block; font-size: 13px; font-weight: 500; color: #6B645C; margin-bottom: 6px; }
    .input {
      display: flex; align-items: center; justify-content: space-between;
      height: 42px; padding: 0 14px; border-radius: 9px; font-size: 16px;
      background: #EBF0FC; border: 1.5px solid #3A6FD8;
    }
    .check { color: #3A8A5C; font-weight: 600; }
    .choices { display: flex; gap: 10px; }
    .choice { flex: 1; height: 40px; border-radius: 9px; border: 1.5px solid #E7E2DA; display: flex; align-items: center; justify-content: center; font-size: 15px; color: #6B645C; }
    .choice.on { background: #3A6FD8; border-color: #3A6FD8; color: #fff; font-weight: 600; }
  </style></head>
  <body>
    <div class="copy">
      <div class="brand"><img class="icon" src="${ICON_URI}"><div class="title">Job Form<br>Autofiller</div></div>
      <div class="tagline">Save your details once.<br>Fill any job application in one click.</div>
      <div class="boards">Greenhouse · Lever · Ashby · Workable</div>
    </div>
    <div class="card">
      <h3>Apply for this job</h3>
      <div class="field"><label>Full name</label><div class="input">Jane Doe<span class="check">✓</span></div></div>
      <div class="field"><label>Email</label><div class="input">jane.doe@example.com<span class="check">✓</span></div></div>
      <div class="field"><label>LinkedIn profile</label><div class="input">linkedin.com/in/jane-doe-sample<span class="check">✓</span></div></div>
      <div class="field"><label>Are you authorized to work in Canada?</label>
        <div class="choices"><div class="choice on">Yes</div><div class="choice">No</div></div></div>
    </div>
  </body></html>`;

async function renderTile(browser, html, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT_DIR, file), type: 'jpeg', quality: 95 });
  await page.close();
  console.log(`✓ screenshots/${file}`);
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
    viewport: { width: 1280, height: 800 },
  });

  // Wait for extension service worker to register
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = sw.url().split('/')[2];
  console.log(`Extension loaded: ${extensionId}`);

  // ── Screenshot 1: Options page ──────────────────────────────────────────────
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  // Pre-populate storage then reload so the rows render
  await optionsPage.evaluate(mappings => {
    return new Promise(resolve => chrome.storage.local.set({ userMappings: mappings }, resolve));
  }, SAMPLE_MAPPINGS);

  await optionsPage.reload();
  await optionsPage.waitForSelector('.row');
  // Wait for the pageIn animation (350ms) to fully complete before shooting
  await optionsPage.waitForFunction(() =>
    document.getAnimations().every(a => a.playState !== 'running')
  );
  await optionsPage.screenshot({ path: path.join(OUT_DIR, 'options-page.jpg'), type: 'jpeg', quality: 95 });
  console.log('✓ screenshots/options-page.jpg');

  // ── Screenshot 2: Autofill in use ───────────────────────────────────────────
  const formPage = await context.newPage();
  await formPage.setContent(MOCK_FORM, { waitUntil: 'domcontentloaded' });

  // Run the real core.js + content.js against the mock form, with
  // chrome.storage stubbed to return the sample data
  await formPage.evaluate(mappings => {
    window.chrome = { storage: { local: { get: (key, cb) => cb({ userMappings: mappings }) } } };
  }, SAMPLE_MAPPINGS);
  const autofillDone = formPage.waitForEvent('console', msg => msg.text() === 'Fuzzy Autofill complete!');
  await formPage.addScriptTag({ path: path.join(EXT_PATH, 'core.js') });
  await formPage.addScriptTag({ path: path.join(EXT_PATH, 'content.js') });
  await autofillDone;

  await formPage.screenshot({ path: path.join(OUT_DIR, 'autofill-in-use.jpg'), type: 'jpeg', quality: 95 });
  console.log('✓ screenshots/autofill-in-use.jpg');

  await context.close();

  // ── Promo tiles: plain pages, no extension needed ─────────────────────────
  const browser = await chromium.launch();
  await renderTile(browser, SMALL_TILE, 440, 280, 'promo-small.jpg');
  await renderTile(browser, MARQUEE_TILE, 1400, 560, 'promo-marquee.jpg');
  await browser.close();
  console.log('\nDone! Upload the files in screenshots/ to the Chrome Web Store listing.');
}

run().catch(err => { console.error(err); process.exit(1); });
