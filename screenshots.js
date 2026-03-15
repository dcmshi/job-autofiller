// Generates Chrome Web Store screenshots using Playwright.
// Usage:
//   npm install
//   npx playwright install chromium
//   node screenshots.js
// Output: screenshots/options-page.png, screenshots/autofill-in-use.png

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const EXT_PATH = path.resolve(__dirname);
const OUT_DIR  = path.resolve(__dirname, 'screenshots');

const SAMPLE_MAPPINGS = {
  'first name':       'David',
  'last name':        'Shi',
  'location':         'Ontario, Canada',
  'previous company': 'Prodigy Education',
  'desired role':     'Software Engineer',
  'linkedin profile': 'https://www.linkedin.com/in/dcmshi/',
  'github url':       'https://github.com/dcmshi',
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

  // Inject core.js globals, then run autofill with the sample data
  const coreJs = fs.readFileSync(path.join(EXT_PATH, 'core.js'), 'utf8');
  await formPage.evaluate(coreJs);

  await formPage.evaluate(userData => {
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea, select'
    );
    inputs.forEach(input => {
      let labelText = '';
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) labelText = label.innerText;
      }
      const targetString = normalize(
        input.name + ' ' + input.id + ' ' + (input.placeholder || '') + ' ' + labelText
      );
      let bestMatchKey = null;
      let lowestDistance = Infinity;
      for (const key of Object.keys(userData)) {
        const normalizedKey = normalize(key);
        if (targetString.includes(normalizedKey)) { bestMatchKey = key; break; }
        const distance = getEditDistance(targetString, normalizedKey);
        if (distance < 3 && distance < lowestDistance) { lowestDistance = distance; bestMatchKey = key; }
      }
      if (bestMatchKey) {
        if (input.tagName === 'SELECT') {
          const opt = findBestOption(input, userData[bestMatchKey]);
          if (opt) { input.value = opt.value; input.dispatchEvent(new Event('change', { bubbles: true })); }
        } else {
          input.value = userData[bestMatchKey];
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }, SAMPLE_MAPPINGS);

  await formPage.screenshot({ path: path.join(OUT_DIR, 'autofill-in-use.jpg'), type: 'jpeg', quality: 95 });
  console.log('✓ screenshots/autofill-in-use.jpg');

  await context.close();
  console.log('\nDone! Upload the files in screenshots/ to the Chrome Web Store listing.');
}

run().catch(err => { console.error(err); process.exit(1); });
