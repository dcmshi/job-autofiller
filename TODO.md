# TODO

## Narrow host permissions (optional)

`manifest.json` requests `host_permissions: ["<all_urls>"]` so application forms embedded in cross-origin iframes can be filled. The Chrome Web Store flags this as "Broad Host Permissions", which triggers an in-depth review. We kept it for 1.2.0 and accepted the slower review.

If review times become a problem, replace it with a list of applicant-tracking-system domains:

```json
"host_permissions": [
  "https://*.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.eu.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://apply.workable.com/*",
  "https://*.smartrecruiters.com/*",
  "https://*.icims.com/*",
  "https://*.myworkdayjobs.com/*",
  "https://jobs.jobvite.com/*",
  "https://*.teamtailor.com/*",
  "https://*.recruitee.com/*",
  "https://*.bamboohr.com/*",
  "https://*.breezy.hr/*",
  "https://*.applytojob.com/*",
  "https://*.jobs.personio.com/*",
  "https://*.jobs.personio.de/*",
  "https://ats.rippling.com/*",
  "https://ats.welcometothejungle.com/*"
]
```

What we verified when trying it:

- `activeTab` still covers the top-level page on any site when the icon is clicked; the list only matters for embedded iframes.
- With `allFrames: true`, Chrome silently skips frames the extension can't access and fills the rest, so an embed from an unlisted job board stays empty but nothing breaks.
- Chrome accepts all 18 patterns (`chrome.permissions.contains` is true for e.g. `boards.greenhouse.io` and `acme.wd5.myworkdayjobs.com`, false for `example.com`).

Also needed when switching:

- `run-autofill.js` can't produce the icon click that grants `activeTab`, so it must load a temp copy of the extension with `host_permissions` widened back to `<all_urls>`.
- Update the "Host access" wording in `docs/privacy-policy.html` and `README.md`, and the host permission justification in the developer dashboard.
