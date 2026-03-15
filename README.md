# Job Form Autofiller

<img src="icons/base_icon.png" alt="Job Form Autofiller icon" width="128"/>

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
  "first name": "Jane",
  "last name": "Doe",
  "location": "City, Country",
  "previous company": "Acme Corp",
  "desired role": "Senior Software Engineer",
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
| `user-data.example.json` | Template for personal data mappings (copy to `user-data.json`) |
| `icons/` | Extension icons (16, 32, 48, 128px) and source `base_icon.png` |

## Permissions Used

- `activeTab` — access the current tab when the icon is clicked
- `scripting` — inject `content.js` into the page
- `storage` — persist your mappings via `chrome.storage.local`

## Running Tests

No install needed — uses Node's built-in test runner (Node 18+).

```bash
node --test tests/core.test.js
```

## Contributing

Contributions and pull requests are very welcome! If you have an idea for an improvement or run into a bug, feel free to open an issue or submit a PR.

If you'd prefer to reach out directly, you can email me at [shibisoma@gmail.com](mailto:shibisoma@gmail.com) — I'm happy to help with any issues or questions you have with the extension.
