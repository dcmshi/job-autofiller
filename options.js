const rowsEl    = document.getElementById('rows');
const emptyEl   = document.getElementById('emptyState');
const addBtn    = document.getElementById('addBtn');
const saveBtn   = document.getElementById('saveBtn');
const savedMsg  = document.getElementById('savedMsg');

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

function buildRow(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <input class="key-input" type="text" placeholder="e.g. first name" value="${escHtml(key)}">
    <input class="val-input" type="text" placeholder="e.g. Jane" value="${escHtml(value)}">
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

// Load on init — prefer chrome.storage, fall back to user-data.json defaults
fetch(chrome.runtime.getURL('user-data.json'))
  .then(r => r.json())
  .then(defaults => {
    chrome.storage.local.get({ userMappings: defaults }, r => loadMappings(r.userMappings));
  })
  .catch(() => {
    chrome.storage.local.get({ userMappings: {} }, r => loadMappings(r.userMappings));
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
