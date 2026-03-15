# Job Form Autofiller

A Chrome extension (Manifest V3) that automatically fills job application form fields using fuzzy key matching.

## How It Works

1. Click the extension icon on any job application page.
2. The content script runs and scans all `input` and `textarea` fields on the page.
3. Each field's `name`, `id`, `placeholder`, and associated `<label>` text are combined into a target string.
4. Your configured key-value mappings are matched against that string using:
   - **Substring matching** — direct hits are preferred immediately.
   - **Levenshtein distance** — fuzzy fallback for minor variations (threshold: distance < 3).
5. Matched fields are filled and `input`/`change` events are dispatched so React/Vue/Angular forms register the values.

## Installation

1. Clone or download this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.

## Configuration

Open the extension's **Options** page (right-click the extension icon → Options) to edit your personal data mappings as JSON:

```json
{
  "first name": "David",
  "last name": "Shi",
  "location": "Ontario, Canada",
  "previous company": "Prodigy Education",
  "desired role": "Senior Data Engineer",
  "linkedin profile": "https://linkedin.com/in/yourprofile",
  "github url": "https://github.com/yourusername"
}
```

The **keys** are what get matched against form fields. Make them descriptive and close to the labels you expect on job sites. Add as many key-value pairs as you need.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension metadata and permissions |
| `background.js` | Service worker — injects content script on icon click |
| `content.js` | Core logic — fuzzy matching and form filling |
| `options.html` | Options page UI |
| `options.js` | Options page logic — loads/saves mappings to `chrome.storage.local` |

## Permissions Used

- `activeTab` — access the current tab when the icon is clicked
- `scripting` — inject `content.js` into the page
- `storage` — persist your mappings via `chrome.storage.local`
