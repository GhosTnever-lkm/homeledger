import { validateItem, summarize, filterItems, exportBackup, importBackup } from './core.mjs';
import { listItems, saveItems } from './store.mjs';

const $ = (selector) => document.querySelector(selector);
const els = {
  body: $('#inventory-body'), empty: $('#empty-state'), noResults: $('#no-results'),
  dialog: $('#item-dialog'), form: $('#item-form'), toast: $('#toast'),
};
let items = [];
let toastTimer;
const todayISO = new Date().toISOString().slice(0, 10);
const fmtDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function money(value, currency = 'USD') {
  if (value === undefined) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value} ${currency}`; }
}
function totalByCurrency() {
  const totals = new Map();
  for (const entry of items) {
    if (entry.price === undefined) continue;
    const currency = entry.currency || 'USD';
    totals.set(currency, (totals.get(currency) || 0) + entry.price);
  }
  return [...totals].map(([currency, amount]) => money(amount, currency)).join(' · ') || money(0);
}
function valueSummary() {
  const totals = new Map();
  for (const entry of items) {
    if (entry.price === undefined) continue;
    const currency = entry.currency || 'USD';
    totals.set(currency, (totals.get(currency) || 0) + entry.price);
  }
  return [...totals].map(([currency, amount]) => money(amount, currency)).join(' · ') || money(0);
}
function statusLabel(status, date) {
  if (status === 'unknown') return '<span class="badge neutral">No date</span>';
  const labels = { active: 'Covered', soon: 'Ending soon', expired: 'Expired' };
  return `<span class="badge ${status}"><i></i>${labels[status]}${date ? ` · ${fmtDate.format(new Date(`${date}T00:00:00Z`))}` : ''}</span>`;
}
function showToast(message, error = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', error);
  els.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 2800);
}

async function persist() { await saveItems(items); render(); }
function updateCategoryOptions() {
  const select = $('#category-filter');
  const current = select.value;
  const categories = [...new Set(items.map((entry) => entry.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="">All categories</option>' + categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
  select.value = categories.includes(current) ? current : '';
}

function render() {
  const today = new Date().toISOString().slice(0, 10);
  const summary = summarize(items, today);
  const shown = filterItems(items, { query: $('#search').value, category: $('#category-filter').value, warranty: $('#warranty-filter').value }, today);
  $('#stat-items').textContent = String(summary.count);
  $('#nav-count').textContent = String(summary.count);
  $('#item-count').textContent = String(summary.count);
  $('#stat-value').textContent = valueSummary();
  $('#stat-soon').textContent = String(summary.warranty.soon);
  $('#stat-expired').textContent = String(summary.warranty.expired);
  const hasFilters = Boolean($('#search').value || $('#category-filter').value || $('#warranty-filter').value);
  els.empty.hidden = items.length > 0;
  els.noResults.hidden = shown.length > 0 || !hasFilters;
  els.body.innerHTML = shown.map((entry) => {
    const status = entry.warrantyUntil ? getStatus(entry, today) : 'unknown';
    const letters = (entry.brand || entry.name).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    return `<tr data-id="${escapeHTML(entry.id)}"><td><div class="item-cell"><span class="item-avatar">${escapeHTML(letters)}</span><span><strong>${escapeHTML(entry.name)}</strong><small>${escapeHTML(entry.brand || entry.serial || 'Personal item')}</small></span></div></td><td>${escapeHTML(entry.category || '—')}</td><td>${escapeHTML(entry.location || '—')}</td><td class="value-cell">${money(entry.price, entry.currency || 'USD')}</td><td>${statusLabel(status, entry.warrantyUntil)}</td><td><button class="row-menu" data-edit="${escapeHTML(entry.id)}" aria-label="Edit ${escapeHTML(entry.name)}">···</button></td></tr>`;
  }).join('');
  const watch = summary.upcoming.filter((entry) => entry.daysLeft >= 0).slice(0, 4);
  $('#warranty-list').innerHTML = watch.map((entry) => `<div class="watch-row"><span class="watch-date"><b>${escapeHTML(entry.warrantyUntil.slice(8, 10))}</b><small>${new Date(`${entry.warrantyUntil}T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</small></span><span class="watch-info"><strong>${escapeHTML(entry.name)}</strong><small>${entry.daysLeft === 0 ? 'Expires today' : `${entry.daysLeft} days left`}</small></span><span class="watch-arrow">↗</span></div>`).join('');
  $('#warranty-empty').hidden = watch.length > 0;
  updateCategoryOptions();
}
function getStatus(entry, today) {
  const remaining = Math.round((new Date(`${entry.warrantyUntil}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
  return remaining < 0 ? 'expired' : remaining <= 30 ? 'soon' : 'active';
}

function openDialog(entry) {
  els.form.reset();
  $('#form-error').textContent = '';
  $('#dialog-title').textContent = entry ? 'Edit item' : 'Add an item';
  $('#item-id').value = entry?.id || '';
  $('#field-name').value = entry?.name || '';
  $('#field-category').value = entry?.category || 'Electronics';
  $('#field-location').value = entry?.location || '';
  $('#field-brand').value = entry?.brand || '';
  $('#field-serial').value = entry?.serial || '';
  $('#field-price').value = entry?.price ?? '';
  $('#field-currency').value = entry?.currency || 'USD';
  $('#field-purchase').value = entry?.purchaseDate || '';
  $('#field-warranty').value = entry?.warrantyUntil || '';
  $('#field-notes').value = entry?.notes || '';
  els.dialog.showModal();
  $('#field-name').focus();
}

for (const id of ['add-first', 'add-item', 'empty-add', 'tip-add']) $(`#${id}`).addEventListener('click', () => openDialog());
$('#dialog-close').addEventListener('click', () => els.dialog.close());
$('#cancel-item').addEventListener('click', () => els.dialog.close());
els.dialog.addEventListener('click', (event) => { if (event.target === els.dialog) els.dialog.close(); });
els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const existingId = $('#item-id').value;
  const record = {
    id: existingId || crypto.randomUUID(), name: $('#field-name').value, category: $('#field-category').value,
    location: $('#field-location').value, brand: $('#field-brand').value, serial: $('#field-serial').value,
    price: $('#field-price').value === '' ? undefined : Number($('#field-price').value), currency: $('#field-currency').value,
    purchaseDate: $('#field-purchase').value || undefined, warrantyUntil: $('#field-warranty').value || undefined,
    notes: $('#field-notes').value,
  };
  try {
    const valid = { ...validateItem(record), currency: record.currency };
    const index = items.findIndex((entry) => entry.id === existingId);
    if (index >= 0) items[index] = valid; else items.unshift(valid);
    await persist();
    els.dialog.close();
    showToast(existingId ? 'Item updated.' : 'Item added to your home.');
  } catch (error) { $('#form-error').textContent = error.message; }
});

els.body.addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit]');
  if (edit) { const entry = items.find((item) => item.id === edit.dataset.edit); if (entry) openDialog(entry); return; }
  const row = event.target.closest('tr[data-id]');
  if (!row) return;
  const entry = items.find((item) => item.id === row.dataset.id);
  if (entry) openDialog(entry);
});
for (const selector of ['#search', '#category-filter', '#warranty-filter']) $(selector).addEventListener('input', render);
$('#clear-filters').addEventListener('click', () => { $('#search').value = ''; $('#category-filter').value = ''; $('#warranty-filter').value = ''; render(); });
$('#export-backup').addEventListener('click', () => {
  const blob = new Blob([exportBackup(items)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `homeledger-backup-${todayISO}.json`; link.click(); URL.revokeObjectURL(link.href);
  showToast('Your backup is ready.');
});
$('#import-backup').addEventListener('click', () => $('#backup-file').click());
$('#backup-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const imported = importBackup(await file.text());
    if (!confirm(`Replace your current ${items.length} items with ${imported.length} items from this backup?`)) return;
    items = imported; await persist(); showToast('Backup restored successfully.');
  } catch (error) { showToast(`Backup not imported: ${error.message}`, true); }
  finally { event.target.value = ''; }
});
$('#theme-toggle').addEventListener('click', () => { document.body.classList.toggle('light-theme'); localStorage.setItem('homeledger-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); });
if (localStorage.getItem('homeledger-theme') === 'light') document.body.classList.add('light-theme');
$('#today-label').textContent = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${todayISO}T00:00:00Z`)).toUpperCase();
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search').focus(); } });

try { items = (await listItems()).map(validateItem); }
catch { items = []; }
render();
