const rowsEl      = document.getElementById('rows');
const emptyEl     = document.getElementById('emptyState');
const addBtn      = document.getElementById('addBtn');
const saveBtn     = document.getElementById('saveBtn');
const savedMsg    = document.getElementById('savedMsg');
const importBtn   = document.getElementById('importBtn');
const importFile  = document.getElementById('importFile');
const exportBtn   = document.getElementById('exportBtn');

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function updateEmptyState() {
  const hasRows = rowsEl.querySelectorAll('.row').length > 0;
  emptyEl.classList.toggle('visible', !hasRows);
}

const VALUE_PLACEHOLDERS = {
  'first name':       'e.g. Jane',
  'last name':        'e.g. Doe',
  'email':            'e.g. jane.doe@email.com',
  'phone':            'e.g. 416-555-0100',
  'city':             'e.g. Toronto',
  'address':          'e.g. 123 Main St',
  'postal code':      'e.g. M5V 3A8',
  'location':         'e.g. Toronto, ON',
  'previous company': 'e.g. Acme Corp',
  'desired role':     'e.g. Software Engineer',
  'linkedin':         'e.g. linkedin.com/in/janedoe',
  'github':           'e.g. github.com/janedoe',
  'personal website': 'e.g. janedoe.dev',
  'portfolio':        'e.g. janedoe.dev/portfolio',
};

function buildRow(key = '', value = '') {
  const valPlaceholder = VALUE_PLACEHOLDERS[key] ?? 'Enter a value';
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <input class="key-input" type="text" placeholder="e.g. first name" value="${escHtml(key)}">
    <input class="val-input" type="text" placeholder="${escHtml(valPlaceholder)}" value="${escHtml(value)}">
    <button class="delete-btn" title="Remove field">
      <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;
  row.querySelector('.delete-btn').addEventListener('click', () => {
    row.style.transition = 'opacity .15s, transform .15s';
    row.style.opacity = '0';
    row.style.transform = 'translateX(6px)';
    setTimeout(() => { row.remove(); updateEmptyState(); }, 150);
  });
  return row;
}

function loadMappings(data) {
  rowsEl.querySelectorAll('.row').forEach(r => r.remove());
  Object.entries(data).forEach(([k, v]) => rowsEl.appendChild(buildRow(k, v)));
  updateEmptyState();
}

function collectMappings() {
  const obj = {};
  rowsEl.querySelectorAll('.row').forEach(row => {
    const k = row.querySelector('.key-input').value.trim();
    const v = row.querySelector('.val-input').value.trim();
    if (k) obj[k] = v;
  });
  return obj;
}

const DEFAULT_MAPPINGS = {
  'first name':     '',
  'last name':      '',
  'email':          '',
  'phone':          '',
  'city':           '',
  'address':        '',
  'postal code':    '',
  'location':       '',
  'previous company': '',
  'desired role':   '',
  'linkedin':       '',
  'github':         '',
  'personal website': '',
  'portfolio':      '',
};

// Load on init — fall back to template fields for first-time users
chrome.storage.local.get({ userMappings: DEFAULT_MAPPINGS }, r => loadMappings(r.userMappings));

// Import JSON
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error();
      loadMappings(data);
    } catch {
      alert('Invalid JSON — expected an object like { "first name": "Jane", ... }');
    }
  };
  reader.readAsText(file);
  importFile.value = '';
});

// Export JSON
exportBtn.addEventListener('click', () => {
  const data = JSON.stringify(collectMappings(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'user-data.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Add row
addBtn.addEventListener('click', () => {
  const row = buildRow();
  rowsEl.appendChild(row);
  row.querySelector('.key-input').focus();
  updateEmptyState();
});

// Save
let saveTimer;
saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({ userMappings: collectMappings() }, () => {
    savedMsg.classList.add('visible');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => savedMsg.classList.remove('visible'), 2000);
  });
});
