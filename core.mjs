const MAX_ITEMS = 5000;
const LIMITS = { id: 64, name: 200, category: 100, location: 100, brand: 120, serial: 120, notes: 2000 };
const STATUS = ['active', 'soon', 'expired', 'unknown'];

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object');
}

export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

export function getLocalISODate(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('date must be a valid Date');
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function requireDate(value, field) {
  if (!isValidISODate(value)) throw new TypeError(`${field} must be a valid ISO date (YYYY-MM-DD)`);
  return value;
}

function utcDay(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / 86400000;
}

function optionalText(source, field, max, output) {
  if (source[field] === undefined || source[field] === null || source[field] === '') return;
  const value = source[field];
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  if (value.length > max) throw new RangeError(`${field} exceeds ${max} characters`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw new TypeError(`${field} contains control characters`);
  output[field] = value.trim();
}

export function validateItem(item) {
  plainObject(item);
  const clean = {};
  for (const [field, max] of Object.entries(LIMITS)) {
    if (field === 'id' || field === 'name') {
      const value = item[field];
      if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
      if (value.length > max) throw new RangeError(`${field} exceeds ${max} characters`);
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw new TypeError(`${field} contains control characters`);
      clean[field] = value.trim();
    } else optionalText(item, field, max, clean);
  }
  if (item.price !== undefined && item.price !== null && item.price !== '') {
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) throw new TypeError('price must be a finite non-negative number');
    clean.price = item.price;
  }
  for (const field of ['purchaseDate', 'warrantyUntil']) {
    if (item[field] !== undefined && item[field] !== null && item[field] !== '') clean[field] = requireDate(item[field], field);
  }
  if (item.currency !== undefined && item.currency !== null && item.currency !== '') {
    if (!['USD', 'EUR', 'GBP', 'AZN', 'RUB'].includes(item.currency)) throw new TypeError('currency must be USD, EUR, GBP, AZN, or RUB');
    clean.currency = item.currency;
  }
  return clean;
}

export function getWarrantyStatus(item, today) {
  plainObject(item);
  requireDate(today, 'today');
  if (!item.warrantyUntil) return 'unknown';
  requireDate(item.warrantyUntil, 'warrantyUntil');
  const remaining = utcDay(item.warrantyUntil) - utcDay(today);
  if (remaining < 0) return 'expired';
  return remaining <= 30 ? 'soon' : 'active';
}

function validateItems(items) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (items.length > MAX_ITEMS) throw new RangeError(`Too many items (maximum ${MAX_ITEMS})`);
  const ids = new Set();
  return items.map((item) => {
    const clean = validateItem(item);
    if (ids.has(clean.id)) throw new TypeError(`Duplicate item id: ${clean.id}`);
    ids.add(clean.id);
    return clean;
  });
}

export function summarize(items, today) {
  requireDate(today, 'today');
  const valid = validateItems(items);
  const warranty = { active: 0, soon: 0, expired: 0, unknown: 0 };
  let totalPrice = 0;
  const upcoming = [];
  for (const item of valid) {
    const status = getWarrantyStatus(item, today);
    warranty[status]++;
    if (item.price !== undefined) totalPrice += item.price;
    if (item.warrantyUntil) upcoming.push({ id: item.id, name: item.name, warrantyUntil: item.warrantyUntil, daysLeft: utcDay(item.warrantyUntil) - utcDay(today) });
  }
  upcoming.sort((a, b) => a.daysLeft - b.daysLeft || a.id.localeCompare(b.id));
  return { count: valid.length, totalPrice, warranty, upcoming: upcoming.slice(0, 5) };
}

export function filterItems(items, filters = {}, today) {
  plainObject(filters);
  const valid = validateItems(items);
  const query = typeof filters.query === 'string' ? filters.query.trim().toLocaleLowerCase() : '';
  const category = typeof filters.category === 'string' ? filters.category.trim().toLocaleLowerCase() : '';
  const location = typeof filters.location === 'string' ? filters.location.trim().toLocaleLowerCase() : '';
  if (filters.warranty && !STATUS.includes(filters.warranty)) throw new TypeError('warranty must be active, soon, expired, or unknown');
  if (filters.warranty) requireDate(today, 'today');
  return valid.filter((item) => {
    const haystack = [item.name, item.category, item.location, item.brand, item.serial, item.notes].filter(Boolean).join(' ').toLocaleLowerCase();
    return (!query || haystack.includes(query))
      && (!category || (item.category || '').toLocaleLowerCase() === category)
      && (!location || (item.location || '').toLocaleLowerCase() === location)
      && (!filters.warranty || getWarrantyStatus(item, today) === filters.warranty);
  });
}

export function exportBackup(items) {
  return JSON.stringify({ version: 1, items: validateItems(items) }, null, 2);
}

export function importBackup(json) {
  if (typeof json !== 'string') throw new TypeError('Backup must be JSON text');
  if (json.length > 20_000_000) throw new RangeError('Backup exceeds 20 MB');
  let backup;
  try { backup = JSON.parse(json); } catch { throw new SyntaxError('Invalid JSON backup'); }
  plainObject(backup);
  if (backup.version !== 1) throw new TypeError(`Unsupported schema version: ${backup.version}`);
  return validateItems(backup.items);
}
