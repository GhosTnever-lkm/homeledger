import test from 'node:test';
import assert from 'node:assert/strict';
import { listItems, saveItems } from './store.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function fakeIndexedDB(state) {
  return {
    open() {
      const request = {};
      queueMicrotask(() => { request.result = {
        close() {},
        transaction(_storeName, mode) {
          const pending = [];
          const tx = { error: new Error('Simulated IndexedDB write failure') };
          tx.objectStore = () => ({
            clear() { pending.push({ type: 'clear' }); },
            put(item) { pending.push({ type: 'put', item }); },
            getAll() {
              const read = {};
              queueMicrotask(() => { read.result = [...state.values.values()]; read.onsuccess?.(); });
              return read;
            },
          });
          Object.defineProperty(tx, 'oncomplete', { set(callback) {
            queueMicrotask(() => {
              if (mode === 'readwrite' && state.failWrites) tx.onerror?.();
              else {
                for (const operation of pending) {
                  if (operation.type === 'clear') state.values.clear();
                  else state.values.set(operation.item.id, operation.item);
                }
                callback?.();
              }
            });
          } });
          return tx;
        },
      }; request.onsuccess?.(); });
      return request;
    },
  };
}

test('a failed IndexedDB write survives reload and migrates back after storage recovers', async () => {
  const previousStorage = globalThis.localStorage;
  const previousIndexedDB = globalThis.indexedDB;
  const storage = memoryStorage();
  const state = { failWrites: true, values: new Map() };
  globalThis.localStorage = storage;
  globalThis.indexedDB = fakeIndexedDB(state);
  try {
    const expected = [{ id: 'item-1', name: 'Desk lamp' }];
    await saveItems(expected);
    assert.equal(storage.getItem('homeledger-storage-mode-v1'), 'fallback');
    assert.deepEqual(await listItems(), expected);

    state.failWrites = false;
    await saveItems(expected);
    assert.equal(storage.getItem('homeledger-storage-mode-v1'), null);
    assert.equal(storage.getItem('homeledger-items-v1'), null);
    assert.deepEqual(await listItems(), expected);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDB;
  }
});
