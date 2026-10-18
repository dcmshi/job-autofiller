# Job Form Autofiller

<img src="icons/base_icon_v2.png" alt="Job Form Autofiller icon" width="128"/>

A Chrome extension (Manifest V3) that automatically fills job application form fields using fuzzy key matching.

## How It Works

1. Click the extension icon on any job application page.
2. The content script scans text inputs, textareas, selects, radio buttons and comboboxes — including inside embedded job-board iframes and open shadow DOM. Fields that are already filled, disabled, read-only or hidden (e.g. honeypots) are left alone.
3. Each field is described by its `autocomplete` attribute, its label (`<label>`, `aria-label`, `aria-labelledby`, fieldset `<legend>`, or nearby text), and its `name`, `id` and `placeholder`.
4. Every one of your keys is scored against that description and the best match wins:
   - **`autocomplete`** (e.g. `given-name`, `postal-code`) is trusted above everything else.
   - **Whole-word matching** — `first name` matches `firstName`, `first_name` or "First Name*", but `city` never matches "Ethnicity".
   - **Synonyms** — surname → last name, zip → postal code, mobile → phone, eligible to work → authorized to work, and more.
   - **Fuzzy fallback** — small typos in longer labels still match ("Frist Name").
   - A **full name** is built from your first and last name when a form asks for one.
5. Text fields get your value; selects, radio buttons and comboboxes get the option that best matches your value. If the best key's value isn't one of the options, the next-best key is tried.
6. `input`/`change` events are dispatched using the native value setter, so React/Vue/Angular forms register the values.

Tested on Greenhouse, Lever, Ashby, Workable and Teamtailor application forms. File uploads (resume) and consent checkboxes are never filled.

## Installation

1. Clone or download this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.

## Configuration

Open the extension's **Options** page (right-click the extension icon → Options) and fill in your details as key/value pairs. Common fields (name, email, phone, location, LinkedIn, ...) are pre-populated — just add your values. You can also **Import JSON** / **Export** your mappings, e.g.:

```json
{
  "first name": "Jane",
  "last name": "Doe",
  "email": "jane.doe@email.com",
  "phone": "+1 416-555-0100",
  "location": "Toronto, ON",
  "linkedin": "https://linkedin.com/in/janedoe",
  "authorized to work": "Yes",
  "require sponsorship": "No",
  "how did you hear": "LinkedIn"
}
```

Tips:

- The **keys** are matched against form fields. Make them descriptive and close to the labels you expect on job sites. Add as many as you need.
- Keys work for yes/no and multiple-choice questions too — the value is matched against the options (`"require sponsorship": "No"`).
- Write the **phone** number with its country code (`+1 ...`) so phone fields with a country picker select the right country.
- For forms in another language, add keys in that language (e.g. `"niveau de français": "Courant"`).

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension metadata and permissions |
| `background.js` | Service worker — injects the scripts on icon click |
| `core.js` | Matching logic — normalization, synonyms, field/key scoring, option matching |
| `content.js` | Page logic — finds fields and labels, fills values, radios and comboboxes |
| `options.html` | Options page UI |
| `options.js` | Options page logic — loads/saves mappings to `chrome.storage.local` |
| `user-data.example.json` | Template for personal data mappings (copy to `user-data.json`) |
| `icons/` | Extension icons (16, 32, 48, 128px) and source `base_icon_v2.png` |
| `tests/` | Unit tests (`core.test.js`) and browser tests (`content.test.js`) |
| `run-autofill.js` | Dev tool — runs the extension against a real page with Playwright |

## Permissions Used

- `activeTab` — access the current tab when the icon is clicked
- `scripting` — inject the autofill scripts into the page
- `storage` — persist your mappings via `chrome.storage.local`
- Host access (`<all_urls>`) — reach job-board forms embedded in iframes from another site (e.g. Greenhouse, Lever). The scripts only run when you click the icon.

## Running Tests

```bash
node --test tests/core.test.js     # matching logic — no install needed (Node 18+)
node --test tests/*.test.js        # everything, including browser tests
```

The browser tests need Playwright's Chromium: `npm install && npx playwright install chromium`.

## Trying It on a Real Page

`run-autofill.js` opens Chromium with the extension loaded, fills a page using your `user-data.json` (or `user-data.example.json`), and prints what was filled. Nothing is submitted.

```bash
node run-autofill.js <application-url>               # browser window stays open; Enter re-runs autofill
node run-autofill.js <application-url> --headless    # just print the report
node run-autofill.js <application-url> --zip         # test the packaged job-autofiller.zip instead
node run-autofill.js <application-url> --data other.json
```

## Generating Screenshots

Generates Chrome Web Store screenshots using Playwright.

```bash
npm install
npx playwright install chromium
node screenshots.js
```

Screenshots are saved to `screenshots/` — upload them directly to the Chrome Web Store listing.

## Building for Distribution

Generates a `job-autofiller.zip` ready to upload to the Chrome Web Store. No dependencies required.

```bash
node package.js
```

## Contributing

Contributions and pull requests are very welcome! If you have an idea for an improvement or run into a bug, feel free to open an issue or submit a PR.

If you'd prefer to reach out directly, you can email me at [shibisoma@gmail.com](mailto:shibisoma@gmail.com) — I'm happy to help with any issues or questions you have with the extension.
