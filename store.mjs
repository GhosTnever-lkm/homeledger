const DB_NAME = 'homeledger-local-v1';
const STORE = 'items';
const FALLBACK_KEY = 'homeledger-items-v1';
const STORAGE_MODE_KEY = 'homeledger-storage-mode-v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local database'));
  });
}

function isFallbackActive() {
  try { return localStorage.getItem(STORAGE_MODE_KEY) === 'fallback'; } catch { return false; }
}

async function run(mode, action) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      action(store, (value) => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Local database operation failed'));
      tx.onabort = () => reject(tx.error || new Error('Local database operation was cancelled'));
    });
  } finally { db.close(); }
}

export async function listItems() {
  if (isFallbackActive()) {
    try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]'); } catch { return []; }
  }
  try {
    const db = await openDatabase();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read items'));
    }); } finally { db.close(); }
  }
  catch {
    try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]'); } catch { return []; }
  }
}

export async function saveItems(items) {
  let db;
  try {
    db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const item of items) store.put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save items'));
      tx.onabort = () => reject(tx.error || new Error('Saving items was cancelled'));
    });
    try {
      localStorage.removeItem(FALLBACK_KEY);
      localStorage.removeItem(STORAGE_MODE_KEY);
    } catch { /* IndexedDB already committed; stale fallback cleanup is best-effort. */ }
  } catch (error) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
    localStorage.setItem(STORAGE_MODE_KEY, 'fallback');
  } finally {
    db?.close();
  }
}
