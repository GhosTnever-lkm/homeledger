const DB_NAME = 'homeledger-local-v1';
const STORE = 'items';
const FALLBACK_KEY = 'homeledger-items-v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local database'));
  });
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
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const item of items) store.put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save items'));
      tx.onabort = () => reject(tx.error || new Error('Saving items was cancelled'));
    });
    db.close();
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
  }
}
