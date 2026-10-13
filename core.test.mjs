import test from 'node:test';
import assert from 'node:assert/strict';
import { validateItem, getWarrantyStatus, summarize, filterItems, exportBackup, importBackup } from './core.mjs';

const item = (id, name, extra = {}) => ({ id, name, ...extra });

test('validates real leap dates and rejects impossible dates', () => {
  assert.equal(validateItem(item('a', 'Camera', { purchaseDate: '2024-02-29' })).purchaseDate, '2024-02-29');
  assert.throws(() => validateItem(item('a', 'Camera', { purchaseDate: '1900-02-29' })), /valid ISO date/);
  assert.throws(() => validateItem(item('a', 'Camera', { warrantyUntil: '2024-02-30' })), /valid ISO date/);
});

test('warranty soon includes the 30-day boundary', () => {
  assert.equal(getWarrantyStatus({ warrantyUntil: '2024-01-31' }, '2024-01-01'), 'soon');
  assert.equal(getWarrantyStatus({ warrantyUntil: '2024-02-01' }, '2024-01-01'), 'active');
});

test('expiry today is soon; previous day is expired', () => {
  assert.equal(getWarrantyStatus({ warrantyUntil: '2024-05-15' }, '2024-05-15'), 'soon');
  assert.equal(getWarrantyStatus({ warrantyUntil: '2024-05-14' }, '2024-05-15'), 'expired');
});

test('missing warranty is unknown', () => {
  assert.equal(getWarrantyStatus({}, '2024-01-01'), 'unknown');
});

test('search is case-insensitive and leaves source data unchanged', () => {
  const record = item('a', 'Desk Lamp', { category: 'Lighting' });
  assert.equal(filterItems([record], { query: 'LAMP' })[0].name, 'Desk Lamp');
  assert.equal(record.name, 'Desk Lamp');
});

test('category, location and warranty filters compose', () => {
  const records = [
    item('a', 'Drill', { category: 'Tools', location: 'Garage', warrantyUntil: '2024-01-15' }),
    item('b', 'Lamp', { category: 'Lighting', location: 'Garage', warrantyUntil: '2024-04-01' }),
    item('c', 'Saw', { category: 'Tools', location: 'Shed', warrantyUntil: '2023-12-01' }),
  ];
  const found = filterItems(records, { category: 'tools', location: 'GARAGE', warranty: 'soon' }, '2024-01-01');
  assert.deepEqual(found.map((entry) => entry.id), ['a']);
});

test('validateItem rejects non-finite and negative prices', () => {
  assert.throws(() => validateItem(item('a', 'Camera', { price: Infinity })), /finite non-negative/);
  assert.throws(() => validateItem(item('a', 'Camera', { price: -1 })), /finite non-negative/);
});

test('backup roundtrip produces independent validated records', () => {
  const source = [item('a', 'Camera', { price: 500, purchaseDate: '2024-02-29', notes: 'Family room' })];
  const copy = importBackup(exportBackup(source));
  assert.deepEqual(copy, source);
  assert.notEqual(copy[0], source[0]);
});

test('backup rejects malformed JSON, unknown schema and invalid items', () => {
  assert.throws(() => importBackup('{'), /Invalid JSON/);
  assert.throws(() => importBackup('{"version":2,"items":[]}'), /Unsupported schema/);
  assert.throws(() => importBackup('{"version":1,"items":[{"id":"x","name":""}]}'), /name is required/);
});

test('backup rejects duplicate IDs instead of allowing one record to overwrite another', () => {
  const backup = JSON.stringify({ version: 1, items: [item('same-id', 'First item'), item('same-id', 'Second item')] });
  assert.throws(() => importBackup(backup), /Duplicate item id: same-id/);
  assert.throws(() => exportBackup([item('same-id', 'First item'), item('same-id', 'Second item')]), /Duplicate item id: same-id/);
});

test('backup rejects more than 5000 items and excessive JSON text', () => {
  assert.throws(() => importBackup(JSON.stringify({ version: 1, items: Array(5001).fill(item('x', 'Box')) })), /Too many items/);
  assert.throws(() => importBackup(' '.repeat(20_000_001)), /20 MB/);
});

test('summary totals known prices and returns five nearest warranties', () => {
  const records = Array.from({ length: 7 }, (_, index) => item(String(index), `Item ${index}`, { price: index ? index * 10 : undefined, warrantyUntil: `2024-0${index + 2}-01` }));
  const result = summarize(records, '2024-01-01');
  assert.equal(result.count, 7);
  assert.equal(result.totalPrice, 210);
  assert.equal(result.upcoming.length, 5);
  assert.deepEqual(result.warranty, { active: 7, soon: 0, expired: 0, unknown: 0 });
});

test('string limits and required identifiers are enforced', () => {
  assert.throws(() => validateItem({ id: 'a', name: ' '.repeat(201) }), /name is required|exceeds/);
  assert.throws(() => validateItem({ name: 'Chair' }), /id is required/);
});
